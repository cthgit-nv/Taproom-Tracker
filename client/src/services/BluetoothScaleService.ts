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

// Web Bluetooth API type definitions (not in standard TypeScript lib)
interface BluetoothDevice extends EventTarget {
  readonly id: string;
  readonly name?: string;
  readonly gatt?: BluetoothRemoteGATTServer;
  addEventListener(type: 'gattserverdisconnected', listener: (event: Event) => void): void;
}

interface BluetoothRemoteGATTServer {
  readonly device: BluetoothDevice;
  readonly connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(service: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService>;
  getPrimaryServices(service?: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService[]>;
}

interface BluetoothRemoteGATTService extends EventTarget {
  readonly device: BluetoothDevice;
  readonly uuid: string;
  readonly isPrimary: boolean;
  getCharacteristic(characteristic: BluetoothCharacteristicUUID): Promise<BluetoothRemoteGATTCharacteristic>;
  getCharacteristics(characteristic?: BluetoothCharacteristicUUID): Promise<BluetoothRemoteGATTCharacteristic[]>;
}

interface BluetoothRemoteGATTCharacteristic extends EventTarget {
  readonly service: BluetoothRemoteGATTService;
  readonly uuid: string;
  readonly properties: BluetoothCharacteristicProperties;
  readonly value?: DataView;
  readValue(): Promise<DataView>;
  writeValue(value: BufferSource): Promise<void>;
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  addEventListener(type: 'characteristicvaluechanged', listener: (event: Event) => void): void;
}

interface BluetoothCharacteristicProperties {
  readonly broadcast: boolean;
  readonly read: boolean;
  readonly writeWithoutResponse: boolean;
  readonly write: boolean;
  readonly notify: boolean;
  readonly indicate: boolean;
  readonly authenticatedSignedWrites: boolean;
  readonly reliableWrite: boolean;
  readonly writableAuxiliaries: boolean;
}

type BluetoothServiceUUID = number | string;
type BluetoothCharacteristicUUID = number | string;

interface BluetoothRequestDeviceOptions {
  filters?: BluetoothLEScanFilter[];
  optionalServices?: BluetoothServiceUUID[];
  acceptAllDevices?: boolean;
}

interface BluetoothLEScanFilter {
  services?: BluetoothServiceUUID[];
  name?: string;
  namePrefix?: string;
  manufacturerData?: BluetoothManufacturerDataFilter[];
  serviceData?: BluetoothServiceDataFilter[];
}

interface BluetoothManufacturerDataFilter {
  companyIdentifier: number;
  dataPrefix?: BufferSource;
  mask?: BufferSource;
}

interface BluetoothServiceDataFilter {
  service: BluetoothServiceUUID;
  dataPrefix?: BufferSource;
  mask?: BufferSource;
}

interface Navigator {
  bluetooth?: {
    requestDevice(options: BluetoothRequestDeviceOptions): Promise<BluetoothDevice>;
    getAvailability(): Promise<boolean>;
  };
}

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
    
    // Web Bluetooth API is available via navigator.bluetooth
  }

  isSupported(): boolean {
    if (typeof navigator === 'undefined') return false;
    if (typeof window === 'undefined') return false;
    const nav = navigator as Navigator;
    return 'bluetooth' in nav && nav.bluetooth !== undefined && 'requestDevice' in nav.bluetooth;
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
      const nav = navigator as Navigator;
      if (!nav.bluetooth) {
        throw new Error('Web Bluetooth API not available');
      }
      const device = await nav.bluetooth.requestDevice({
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
      if (!device.gatt) {
        throw new Error('Device does not support GATT server');
      }
      this.server = await device.gatt.connect();
      
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
        characteristic.addEventListener('characteristicvaluechanged', (event: Event) => {
          const target = event.target;
          if (target && 'value' in target) {
            this.handleWeightUpdate(target as BluetoothRemoteGATTCharacteristic);
          }
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

  private handleWeightUpdate(characteristic: BluetoothRemoteGATTCharacteristic | EventTarget): void {
    const char = characteristic as BluetoothRemoteGATTCharacteristic;
    if (!char || !char.value) return;
    const dataView = char.value;
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
