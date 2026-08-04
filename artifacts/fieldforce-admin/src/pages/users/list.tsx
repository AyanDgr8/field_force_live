import { useState } from 'react';
import { useLocation } from 'wouter';
import { useListUsers } from '@workspace/api-client-react';
import { format } from 'date-fns';
import { Search, UserCircle, Shield } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { normalizeList } from '@/lib/normalize-list';

export default function UsersList() {
  const [, setLocation] = useLocation();
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const { data: users, isLoading } = useListUsers({
    role: roleFilter !== 'all' ? roleFilter as any : undefined,
    status: statusFilter !== 'all' ? statusFilter as any : undefined,
  });

  const userList = normalizeList<NonNullable<typeof users>[number]>(users, ['users']);
  const filteredUsers = userList.filter(u =>
    u.firstName.toLowerCase().includes(search.toLowerCase()) ||
    u.lastName.toLowerCase().includes(search.toLowerCase()) ||
    u.employeeCode.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage field workforce and administrative access.</p>
        </div>
      </div>

      <Card>
        <div className="p-4 border-b flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, code, or email..."
              className="pl-9 w-full"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All Roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="USER">Field Agents</SelectItem>
                <SelectItem value="SUPER_ADMIN">Super Admins</SelectItem>
                <SelectItem value="STATE_ADMIN">State Admins</SelectItem>
                <SelectItem value="HUB_ADMIN">Hub Admins</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="INVITED">Invited</SelectItem>
                <SelectItem value="SUSPENDED">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground bg-muted/50 uppercase">
              <tr>
                <th className="px-6 py-4 font-medium">User</th>
                <th className="px-6 py-4 font-medium">Code / Phone</th>
                <th className="px-6 py-4 font-medium">Role</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                    Loading users...
                  </td>
                </tr>
              ) : filteredUsers?.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                    No users found matching criteria.
                  </td>
                </tr>
              ) : (
                filteredUsers?.map(user => (
                  <tr
                    key={user.id}
                    role="link"
                    tabIndex={0}
                    aria-label={`Open ${user.firstName} ${user.lastName}`}
                    className="cursor-pointer hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30 transition-colors"
                    onClick={() => setLocation(`/users/${user.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setLocation(`/users/${user.id}`);
                      }
                    }}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                          {user.firstName[0]}{user.lastName[0]}
                        </div>
                        <div>
                          <div className="font-medium text-foreground">{user.firstName} {user.lastName}</div>
                          <div className="text-xs text-muted-foreground">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-mono text-xs">{user.employeeCode}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{user.phoneNumber}</div>
                    </td>
                    <td className="px-6 py-4">
                      {user.role !== 'USER' ? (
                        <Badge variant="secondary" className="gap-1 bg-amber-50 text-amber-700 hover:bg-amber-50"><Shield className="w-3 h-3" /> Admin</Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1 bg-blue-50 text-blue-700 hover:bg-blue-50"><UserCircle className="w-3 h-3" /> Agent</Badge>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={user.status} />
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {format(new Date(user.createdAt), 'MMM d, yyyy')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'ACTIVE') return <Badge variant="outline" className="border-emerald-200 text-emerald-700 bg-emerald-50">Active</Badge>;
  if (status === 'INVITED') return <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50">Invited</Badge>;
  if (status === 'SUSPENDED') return <Badge variant="outline" className="border-slate-200 text-slate-700 bg-slate-50">Suspended</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}
