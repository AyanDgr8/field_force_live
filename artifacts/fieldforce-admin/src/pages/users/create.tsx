import { useState } from 'react';
import { useLocation } from 'wouter';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCreateUser } from '@workspace/api-client-react';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Loader2, Plus, Trash2, Copy, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';

const addressSchema = z.object({
  type: z.enum(['HOME', 'OFFICE', 'BASE_OFFICE', 'SITE_OFFICE']),
  rawAddress: z.string().min(5, "Address must be at least 5 characters")
});

const userSchema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  employeeCode: z.string().min(2),
  phoneNumber: z.string().min(10),
  email: z.string().email(),
  role: z.enum(['USER', 'ADMIN']),
  addresses: z.array(addressSchema).min(1, "At least one address is required"),
});

type FormValues = z.infer<typeof userSchema>;

export default function UserCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createUser = useCreateUser();
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      gender: 'MALE',
      employeeCode: '',
      phoneNumber: '',
      email: '',
      role: 'USER',
      addresses: [{ type: 'BASE_OFFICE', rawAddress: '' }]
    }
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "addresses"
  });

  const onSubmit = (data: FormValues) => {
    createUser.mutate({ data }, {
      onSuccess: (res) => {
        if (res.user.role === 'USER' && res.onboardingInvite) {
          setInviteLink(res.onboardingInvite.deepLink);
          toast({ title: "User created successfully", description: "Share the onboarding link to continue." });
        } else {
          toast({ title: "Admin created successfully" });
          setLocation('/users');
        }
      },
      onError: (err: any) => {
        toast({ title: "Error creating user", description: err.message, variant: "destructive" });
      }
    });
  };

  const copyLink = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (inviteLink) {
    return (
      <div className="max-w-2xl mx-auto mt-12 space-y-6">
        <Card className="border-primary/20 shadow-md">
          <CardHeader className="text-center pb-2">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <CardTitle className="text-2xl">Field Agent Created</CardTitle>
            <CardDescription>
              Share this unique onboarding link with the agent so they can download the app and activate their account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-muted p-4 rounded-md flex items-center justify-between gap-4 border">
              <code className="text-sm truncate font-mono text-muted-foreground">{inviteLink}</code>
              <Button size="icon" variant="outline" onClick={copyLink} className="shrink-0">
                {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <Button className="w-full" onClick={() => setLocation('/users')}>
              Return to Fleet
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      <div className="flex items-center gap-4">
        <Link href="/users">
          <Button variant="outline" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Create User</h1>
          <p className="text-sm text-muted-foreground">Add a new field agent or administrator.</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Profile Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="firstName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="lastName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address</FormLabel>
                    <FormControl><Input type="email" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="phoneNumber" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl><Input type="tel" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <FormField control={form.control} name="employeeCode" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Employee Code</FormLabel>
                    <FormControl><Input {...field} placeholder="EMP-001" className="font-mono text-sm" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="role" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="USER">Field Agent</SelectItem>
                        <SelectItem value="ADMIN">Administrator</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="gender" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gender</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="MALE">Male</SelectItem>
                        <SelectItem value="FEMALE">Female</SelectItem>
                        <SelectItem value="OTHER">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Addresses</CardTitle>
                <CardDescription>Add locations associated with this user.</CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => append({ type: 'HOME', rawAddress: '' })}>
                <Plus className="w-4 h-4 mr-2" /> Add Address
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {fields.map((field, index) => (
                <div key={field.id} className="flex gap-4 items-start">
                  <FormField control={form.control} name={`addresses.${index}.type`} render={({ field: selectField }) => (
                    <FormItem className="w-[180px] shrink-0">
                      <Select onValueChange={selectField.onChange} defaultValue={selectField.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="BASE_OFFICE">Base Office</SelectItem>
                          <SelectItem value="SITE_OFFICE">Site Office</SelectItem>
                          <SelectItem value="HOME">Home</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name={`addresses.${index}.rawAddress`} render={({ field: inputField }) => (
                    <FormItem className="flex-1">
                      <FormControl><Input {...inputField} placeholder="Full street address..." /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  {fields.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} className="shrink-0 text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Link href="/users">
              <Button variant="ghost" type="button">Cancel</Button>
            </Link>
            <Button type="submit" disabled={createUser.isPending}>
              {createUser.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create User
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
