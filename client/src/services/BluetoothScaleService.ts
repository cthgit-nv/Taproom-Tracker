/**
 * Bluetooth Scale Service
 * Handles Web Bluetooth API connection to digital scales
 * 
 * Browser Support:
 * - Chrome/Edge (Desktop & Android): Full support
 * - Safari (iOS): Requires Bluefy browser for Web Bluetooth API
 * - Firefox: Limited support
 * 
 * Recommended: Use Bluefy browser on iOS for best compatibility
 */

interface ScaleReading {
  weight: number; // in grams
  unit: 'g' | 'kg' | 'oz' | 'lb';
  stable: boolean;
  timestamp: number;
}

interface BluetoothScaleService {
  isSupported(): boolean;
  isConnected(): boolean;
  connect(): Promise<void>;
  disconnect(): void;
  getCurrentWeight(): number | null;
  onWeightChange(callback: (weight: number) => void): void;
  offWeightChange(callback: (weight: number) => void): void;
}

// Common Bluetooth scale service UUIDs
const SCALE_SERVICE_UUID = '0000fff0-0000-1000-8000-00805f9b34fb';
const SCALE_CHARACTERISTIC_UUID = '0000fff1-0000-1000-8000-00805f9b34fb';

// Alternative service UUIDs for different scale manufacturers
const ALTERNATIVE_SERVICE_UUIDS = [
  '0000fff0-0000-1000-8000-00805f9b34fb', // Generic scale
  '00001820-0000-1000-8000-00805f9b34fb', // Weight Scale Service
  '0000181d-0000-1000-8000-00805f9b34fb', // Health Thermometer (some scales use this)
];

class BluetoothScaleServiceImpl implements BluetoothScaleService {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private weightCallbacks: Set<(weight: number) => void> = new Set();
  private currentWeight: number | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private deviceId: string | null = null; // Store device ID for reconnection

  constructor() {
    // Try to restore connection from localStorage
    this.restoreConnection();
    
    // Listen for device disconnection
    if (typeof navigator !== 'undefined' && 'bluetooth' in navigator) {
      navigator.bluetooth.addEventListener('advertisementreceived', () => {});
    }
  }

  isSupported(): boolean {
    if (typeof navigator === 'undefined') return false;
    if (typeof window === 'undefined') return false;
    return 'bluetooth' in navigator && 'requestDevice' in navigator.bluetooth;
  }

  isConnected(): boolean {
    return this.device !== null && this.device.gatt?.connected === true;
  }

  getCurrentWeight(): number | null {
    return this.currentWeight;
  }

  async connect(): Promise<void> {
    if (!this.isSupported()) {
      throw new Error(
        'Web Bluetooth API not supported. ' +
        'On iOS, please use Bluefy browser. ' +
        'On other devices, use Chrome/Edge.'
      );
    }

    try {
      // Check if we have a saved device ID to reconnect to
      if (this.deviceId) {
        try {
          await this.reconnectToDevice();
          return;
        } catch (error) {
          console.warn('Failed to reconnect to saved device, scanning for new device:', error);
          this.deviceId = null;
        }
      }

      // Request device with filters
      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [SCALE_SERVICE_UUID] },
          { services: ALTERNATIVE_SERVICE_UUIDS },
          { namePrefix: 'Scale' },
          { namePrefix: 'WEIGHT' },
          { namePrefix: 'BLUETOOTH SCALE' },
        ],
        optionalServices: ALTERNATIVE_SERVICE_UUIDS,
      });

      this.device = device;
      this.deviceId = device.id;

      // Save device ID for reconnection
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('bluetooth_scale_device_id', device.id);
        localStorage.setItem('bluetooth_scale_device_name', device.name || 'Unknown Scale');
      }

      // Listen for disconnection
      device.addEventListener('gattserverdisconnected', () => {
        this.handleDisconnection();
      });

      // Connect to GATT server
      this.server = await device.gatt!.connect();
      
      // Try to find the scale service
      let service: BluetoothRemoteGATTService | null = null;
      for (const serviceUUID of [SCALE_SERVICE_UUID, ...ALTERNATIVE_SERVICE_UUIDS]) {
        try {
          service = await this.server.getPrimaryService(serviceUUID);
          break;
        } catch {
          continue;
        }
      }

      if (!service) {
        // Try to get any service and look for weight characteristics
        const services = await this.server.getPrimaryServices();
        for (const svc of services) {
          try {
            const characteristics = await svc.getCharacteristics();
            for (const char of characteristics) {
              if (char.properties.read || char.properties.notify) {
                service = svc;
                break;
              }
            }
            if (service) break;
          } catch {
            continue;
          }
        }
      }

      if (!service) {
        throw new Error('Could not find scale service on device');
      }

      // Get characteristic for weight readings
      const characteristics = await service.getCharacteristics();
      let characteristic: BluetoothRemoteGATTCharacteristic | null = null;

      // Try to find weight characteristic
      for (const char of characteristics) {
        if (char.properties.notify || char.properties.read) {
          characteristic = char;
          break;
        }
      }

      if (!characteristic) {
        throw new Error('Could not find weight characteristic on device');
      }

      this.characteristic = characteristic;

      // Enable notifications if supported
      if (characteristic.properties.notify) {
        await characteristic.startNotifications();
        characteristic.addEventListener('characteristicvaluechanged', (event) => {
          this.handleWeightUpdate(event.target as BluetoothRemoteGATTCharacteristic);
        });
      }

      // Read initial weight
      if (characteristic.properties.read) {
        await this.readWeight();
      }

      this.reconnectAttempts = 0;
      this.currentWeight = null;

    } catch (error) {
      if (error instanceof DOMException) {
        if (error.name === 'NotFoundError') {
          throw new Error('No Bluetooth scale found. Make sure your scale is turned on and in pairing mode.');
        } else if (error.name === 'SecurityError') {
          throw new Error('Bluetooth permission denied. Please allow Bluetooth access.');
        } else if (error.name === 'NetworkError') {
          throw new Error('Failed to connect to scale. Make sure it is nearby and turned on.');
        }
      }
      throw error;
    }
  }

  private async reconnectToDevice(): Promise<void> {
    if (!this.deviceId || !this.isSupported()) {
      throw new Error('Cannot reconnect: no saved device');
    }

    // Request device by ID (this may not work in all browsers)
    // Fallback: user will need to reconnect manually
    throw new Error('Automatic reconnection not available. Please reconnect manually.');
  }

  private async readWeight(): Promise<void> {
    if (!this.characteristic || !this.characteristic.properties.read) {
      return;
    }

    try {
      const dataView = await this.characteristic.readValue();
      const weight = this.parseWeightData(dataView);
      if (weight !== null) {
        this.currentWeight = weight;
        this.notifyWeightChange(weight);
      }
    } catch (error) {
      console.error('Error reading weight:', error);
    }
  }

  private handleWeightUpdate(characteristic: BluetoothRemoteGATTCharacteristic): void {
    const dataView = characteristic.value;
    if (!dataView) return;

    const weight = this.parseWeightData(dataView);
    if (weight !== null) {
      this.currentWeight = weight;
      this.notifyWeightChange(weight);
    }
  }

  private parseWeightData(dataView: DataView): number | null {
    // Different scales use different data formats
    // Common formats:
    // 1. 2-byte little-endian (grams)
    // 2. 4-byte little-endian (grams or 0.1g units)
    // 3. ASCII string

    try {
      // Try 2-byte little-endian (most common)
      if (dataView.byteLength >= 2) {
        const weight = dataView.getUint16(0, true); // little-endian
        if (weight > 0 && weight < 50000) { // Reasonable range for grams
          return weight;
        }
      }

      // Try 4-byte little-endian
      if (dataView.byteLength >= 4) {
        const weight = dataView.getUint32(0, true); // little-endian
        if (weight > 0 && weight < 50000) {
          return weight;
        }
      }

      // Try ASCII string
      const text = new TextDecoder().decode(dataView);
      const match = text.match(/(\d+\.?\d*)/);
      if (match) {
        const weight = parseFloat(match[1]);
        if (weight > 0 && weight < 50000) {
          return weight;
        }
      }
    } catch (error) {
      console.error('Error parsing weight data:', error);
    }

    return null;
  }

  private notifyWeightChange(weight: number): void {
    this.weightCallbacks.forEach(callback => {
      try {
        callback(weight);
      } catch (error) {
        console.error('Error in weight change callback:', error);
      }
    });
  }

  private handleDisconnection(): void {
    this.device = null;
    this.server = null;
    this.characteristic = null;
    this.currentWeight = null;

    // Try to reconnect automatically
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      this.reconnectTimeout = setTimeout(() => {
        this.connect().catch(error => {
          console.error('Auto-reconnect failed:', error);
        });
      }, 2000);
    }
  }

  private restoreConnection(): void {
    if (typeof localStorage === 'undefined') return;
    
    const savedDeviceId = localStorage.getItem('bluetooth_scale_device_id');
    if (savedDeviceId) {
      this.deviceId = savedDeviceId;
    }
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.characteristic) {
      try {
        this.characteristic.stopNotifications();
      } catch {
        // Ignore errors
      }
      this.characteristic = null;
    }

    if (this.server && this.server.connected) {
      this.server.disconnect();
      this.server = null;
    }

    if (this.device) {
      if (this.device.gatt?.connected) {
        this.device.gatt.disconnect();
      }
      this.device = null;
    }

    this.currentWeight = null;
    this.reconnectAttempts = 0;

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('bluetooth_scale_device_id');
      localStorage.removeItem('bluetooth_scale_device_name');
    }
  }

  onWeightChange(callback: (weight: number) => void): void {
    this.weightCallbacks.add(callback);
  }

  offWeightChange(callback: (weight: number) => void): void {
    this.weightCallbacks.delete(callback);
  }
}

// Singleton instance
export const bluetoothScaleService = new BluetoothScaleServiceImpl();
