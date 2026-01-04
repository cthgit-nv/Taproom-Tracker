import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, Key, Users, Shield, ShieldCheck, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { User } from "@shared/schema";

type SafeUser = Omit<User, "pinCode">;

export default function AdminTeamPage() {
  const [, navigate] = useLocation();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [resetPinDialogOpen, setResetPinDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<SafeUser | null>(null);
  
  const [newName, setNewName] = useState("");
  const [newPin, setNewPin] = useState("");
  const [newRole, setNewRole] = useState<"staff" | "admin" | "owner">("staff");
  const [resetPin, setResetPin] = useState("");
  
  const { data: users = [], isLoading } = useQuery<SafeUser[]>({
    queryKey: ["/api/users"],
  });
  
  const createUserMutation = useMutation({
    mutationFn: async (data: { name: string; pinCode: string; role: string }) => {
      const response = await apiRequest("POST", "/api/users", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "User created successfully" });
      setAddDialogOpen(false);
      setNewName("");
      setNewPin("");
      setNewRole("staff");
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create user", description: error.message, variant: "destructive" });
    },
  });
  
  const updateUserMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { pinCode?: string; name?: string; role?: string } }) => {
      const response = await apiRequest("PATCH", `/api/users/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "PIN reset successfully" });
      setResetPinDialogOpen(false);
      setSelectedUser(null);
      setResetPin("");
    },
    onError: (error: Error) => {
      toast({ title: "Failed to reset PIN", description: error.message, variant: "destructive" });
    },
  });
  
  const deleteUserMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("DELETE", `/api/users/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "User deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete user", description: error.message, variant: "destructive" });
    },
  });

  if (!currentUser || currentUser.role !== "owner") {
    return (
      <div className="min-h-screen bg-[#051a11] flex items-center justify-center p-4">
        <Card className="bg-[#0a2419] border-[#1A4D2E]">
          <CardContent className="p-6 text-center">
            <Shield className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <p className="text-white text-lg">Owner access required</p>
            <p className="text-white/60 text-sm mt-2">Only the owner can access team management.</p>
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => navigate("/dashboard")}
              data-testid="button-back-dashboard"
            >
              Return to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "owner": return <ShieldCheck className="w-4 h-4 text-[#D4AF37]" />;
      case "admin": return <Shield className="w-4 h-4 text-blue-400" />;
      default: return <UserIcon className="w-4 h-4 text-white/60" />;
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "owner": 
        return <Badge className="bg-[#D4AF37]/20 text-[#D4AF37] border-[#D4AF37]/50">Owner</Badge>;
      case "admin": 
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/50">Admin</Badge>;
      default: 
        return <Badge variant="secondary">Staff</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-[#051a11]">
      <header className="sticky top-0 z-50 bg-[#0a2419] border-b border-[#1A4D2E] px-4 py-3">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => navigate("/dashboard")}
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-white">Team Management</h1>
            <p className="text-sm text-white/60">Manage users and permissions</p>
          </div>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="icon" className="bg-[#1A4D2E]" data-testid="button-add-user">
                <Plus className="w-5 h-5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#0a2419] border-[#1A4D2E]">
              <DialogHeader>
                <DialogTitle className="text-white">Add New User</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label className="text-white">Name</Label>
                  <Input 
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Enter name"
                    className="bg-[#051a11] border-[#1A4D2E] text-white"
                    data-testid="input-new-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-white">PIN (4 digits)</Label>
                  <Input 
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="Enter 4-digit PIN"
                    className="bg-[#051a11] border-[#1A4D2E] text-white"
                    maxLength={4}
                    data-testid="input-new-pin"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-white">Role</Label>
                  <Select value={newRole} onValueChange={(v) => setNewRole(v as typeof newRole)}>
                    <SelectTrigger className="bg-[#051a11] border-[#1A4D2E] text-white" data-testid="select-new-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0a2419] border-[#1A4D2E]">
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="admin">Admin (GM)</SelectItem>
                      <SelectItem value="owner">Owner</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline" data-testid="button-cancel-add">Cancel</Button>
                </DialogClose>
                <Button 
                  className="bg-[#1A4D2E]"
                  onClick={() => createUserMutation.mutate({ name: newName, pinCode: newPin, role: newRole })}
                  disabled={!newName || newPin.length !== 4 || createUserMutation.isPending}
                  data-testid="button-confirm-add"
                >
                  {createUserMutation.isPending ? "Creating..." : "Create User"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <main className="p-4 space-y-4 pb-24">
        <Card className="bg-[#0a2419] border-[#1A4D2E]">
          <CardHeader className="pb-2">
            <CardTitle className="text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-[#D4AF37]" />
              Team Members ({users.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              <p className="text-white/60 text-center py-4">Loading...</p>
            ) : users.length === 0 ? (
              <p className="text-white/60 text-center py-4">No users found</p>
            ) : (
              users.map((user) => (
                <div 
                  key={user.id} 
                  className="flex items-center gap-3 p-3 rounded-lg bg-[#051a11] border border-[#1A4D2E]/50"
                  data-testid={`user-row-${user.id}`}
                >
                  <div className="w-10 h-10 rounded-full bg-[#1A4D2E] flex items-center justify-center">
                    {getRoleIcon(user.role)}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-white">{user.name}</p>
                    {getRoleBadge(user.role)}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => {
                        setSelectedUser(user);
                        setResetPinDialogOpen(true);
                      }}
                      data-testid={`button-reset-pin-${user.id}`}
                    >
                      <Key className="w-4 h-4 text-white/60" />
                    </Button>
                    {user.role !== "owner" && user.id !== currentUser?.id && (
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => {
                          if (confirm(`Delete ${user.name}?`)) {
                            deleteUserMutation.mutate(user.id);
                          }
                        }}
                        data-testid={`button-delete-${user.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="bg-[#0a2419] border-[#1A4D2E]">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-sm">Role Permissions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-[#D4AF37] mt-0.5" />
              <div>
                <p className="font-medium text-white">Owner</p>
                <p className="text-white/60">Full access including Team Management, API Keys, and all settings</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-blue-400 mt-0.5" />
              <div>
                <p className="font-medium text-white">Admin (GM)</p>
                <p className="text-white/60">Reports, Financials, and Simulation Mode toggle. No API keys or user management</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <UserIcon className="w-5 h-5 text-white/60 mt-0.5" />
              <div>
                <p className="font-medium text-white">Staff</p>
                <p className="text-white/60">Inventory, Taps, and Ordering only. Cost/profit data hidden</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      <Dialog open={resetPinDialogOpen} onOpenChange={setResetPinDialogOpen}>
        <DialogContent className="bg-[#0a2419] border-[#1A4D2E]">
          <DialogHeader>
            <DialogTitle className="text-white">Reset PIN for {selectedUser?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-white">New PIN (4 digits)</Label>
              <Input 
                value={resetPin}
                onChange={(e) => setResetPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="Enter new 4-digit PIN"
                className="bg-[#051a11] border-[#1A4D2E] text-white"
                maxLength={4}
                data-testid="input-reset-pin"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" data-testid="button-cancel-reset">Cancel</Button>
            </DialogClose>
            <Button 
              className="bg-[#1A4D2E]"
              onClick={() => {
                if (selectedUser) {
                  updateUserMutation.mutate({ id: selectedUser.id, data: { pinCode: resetPin } });
                }
              }}
              disabled={resetPin.length !== 4 || updateUserMutation.isPending}
              data-testid="button-confirm-reset"
            >
              {updateUserMutation.isPending ? "Resetting..." : "Reset PIN"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
