/**
 * Profiles — the marquee Phase 40 feature.
 *
 * A Profile is a saved bundle of headset configuration (name + Wi-Fi + apps
 * to install + apps to remove + default kiosk + launcher config). Applying
 * one to a headset is the single click that takes a fresh-out-of-the-box
 * Quest 2 from "blank with Meta defaults" to "ready for a class period."
 *
 * This page has three responsibilities:
 *
 *   1. List every saved profile in a card grid, with a quick-apply dropdown
 *      that lets the teacher push a profile to any online headset in one
 *      click without leaving the page.
 *   2. Edit / duplicate / delete profiles via a slide-in editor dialog. The
 *      editor is the source of truth for what fields a profile carries.
 *   3. Show a live apply log when something is in progress, so the teacher
 *      sees per-step status (rename → wifi → installs → removes → launcher
 *      → kiosk) instead of a blank wait.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  Circle,
  Copy,
  GraduationCap,
  Loader2,
  Pencil,
  Plus,
  Rocket,
  Trash2,
  XCircle,
} from "lucide-react";
import { api, onProfileApplyEvent } from "@/lib/tauri";
import { toast } from "@/components/ui/toast";
import { useDevices } from "@/hooks/useDevices";
import type { Profile, ProfileApplyEvent, CatalogApp } from "@/types";

// Common Quest 2 bloatware that schools usually want to strip on enrollment.
// Surfaced as quick-pick chips in the editor so a teacher doesn't have to
// remember the full package names.
const COMMON_REMOVE_PACKAGES = [
  { pkg: "com.oculus.firstrun", label: "First Steps tutorial" },
  { pkg: "com.oculus.tv", label: "Oculus TV" },
  { pkg: "com.oculus.browser", label: "Browser" },
  { pkg: "com.oculus.environment.prod", label: "Environments" },
];

export function Profiles() {
  const qc = useQueryClient();
  const { data: devices } = useDevices();
  const onlineDevices = (devices ?? []).filter((d) => d.state === "device");

  const profiles = useQuery({
    queryKey: ["profiles"],
    queryFn: api.profileList,
  });

  const catalog = useQuery({
    queryKey: ["catalog_cached"],
    queryFn: api.catalogGetCached,
    staleTime: Infinity,
  });

  // Editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);

  // Apply progress state — keyed by serial so multiple applies don't clobber.
  const [applyLog, setApplyLog] = useState<Map<string, ProfileApplyEvent[]>>(
    new Map()
  );
  const [applyingSerials, setApplyingSerials] = useState<Set<string>>(new Set());

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    onProfileApplyEvent((e) => {
      setApplyLog((prev) => {
        const next = new Map(prev);
        const serial = e.serial;
        const list = next.get(serial) ?? [];
        next.set(serial, [...list, e]);
        return next;
      });
      if (e.type === "done") {
        setApplyingSerials((prev) => {
          const next = new Set(prev);
          next.delete(e.serial);
          return next;
        });
        if (e.fail_steps === 0) {
          toast.success(
            `Profile applied — ${e.ok_steps} step${e.ok_steps === 1 ? "" : "s"} ok`
          );
        } else {
          toast.warning(
            `Profile applied with ${e.fail_steps} failure${e.fail_steps === 1 ? "" : "s"} (${e.ok_steps} ok)`
          );
        }
        qc.invalidateQueries({ queryKey: ["apps"] });
      }
    }).then((u) => (unlisten = u));
    return () => unlisten?.();
  }, [qc]);

  function newProfile() {
    setEditingProfile({
      id: `profile-${Date.now()}`,
      name: "",
      description: "",
      username: "",
      headset_name: "",
      wifi: null,
      install_apps: [],
      remove_packages: [],
      kiosk_app: null,
      launcher: null,
      launcher_apk_path: null,
    });
    setEditorOpen(true);
  }

  function editProfile(p: Profile) {
    setEditingProfile(structuredClone(p));
    setEditorOpen(true);
  }

  function duplicateProfile(p: Profile) {
    setEditingProfile({
      ...structuredClone(p),
      id: `profile-${Date.now()}`,
      name: `${p.name} (copy)`,
    });
    setEditorOpen(true);
  }

  async function deleteProfile(p: Profile) {
    if (!confirm(`Delete profile "${p.name}"? This can't be undone.`)) return;
    try {
      await api.profileDelete(p.id);
      qc.invalidateQueries({ queryKey: ["profiles"] });
      toast.success(`Deleted "${p.name}"`);
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message ?? "Delete failed");
    }
  }

  async function saveProfile() {
    if (!editingProfile) return;
    if (!editingProfile.name.trim()) {
      toast.error("Profile name is required");
      return;
    }
    try {
      await api.profileSave(editingProfile);
      qc.invalidateQueries({ queryKey: ["profiles"] });
      setEditorOpen(false);
      setEditingProfile(null);
      toast.success("Profile saved");
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message ?? "Save failed");
    }
  }

  async function applyProfile(profileId: string, serial: string) {
    setApplyingSerials((prev) => new Set(prev).add(serial));
    setApplyLog((prev) => new Map(prev).set(serial, []));
    try {
      await api.profileApply(serial, profileId);
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message ?? "Apply failed");
      setApplyingSerials((prev) => {
        const next = new Set(prev);
        next.delete(serial);
        return next;
      });
    }
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Profiles"
        subtitle="Save a setup once → apply to any headset in one click. Like ManageXR deployments, scoped for K-12."
        right={
          <Button onClick={newProfile} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            New profile
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Empty state */}
        {profiles.data && profiles.data.length === 0 && (
          <Card>
            <CardContent className="p-10 text-center max-w-2xl mx-auto">
              <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <GraduationCap className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">No profiles yet</h3>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                A profile is a reusable setup: a name like{" "}
                <strong>"Library Stations"</strong> or{" "}
                <strong>"Mrs. Smith 5th Grade"</strong>, the apps you want
                installed, optional Wi-Fi credentials, what to remove, and an
                optional kiosk lock. Save it once. Apply it with one click to
                any new headset you plug in. No more checklist.
              </p>
              <Button className="mt-6" onClick={newProfile}>
                <Plus className="h-4 w-4 mr-2" />
                Create your first profile
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Profile cards */}
        {profiles.data && profiles.data.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {profiles.data.map((p) => (
              <ProfileCard
                key={p.id}
                profile={p}
                catalog={catalog.data?.apps ?? []}
                onlineDevices={onlineDevices.map((d) => ({
                  serial: d.serial,
                  label:
                    `${d.model ?? "Quest"} (${d.serial.slice(-4)})` +
                    (d.connection_type === "wireless" ? " · wireless" : ""),
                }))}
                onEdit={() => editProfile(p)}
                onDuplicate={() => duplicateProfile(p)}
                onDelete={() => deleteProfile(p)}
                onApply={(serial) => applyProfile(p.id, serial)}
              />
            ))}
          </div>
        )}

        {/* Live apply log per active serial */}
        {Array.from(applyLog.entries())
          .filter(([, events]) => events.length > 0)
          .map(([serial, events]) => (
            <ApplyProgressCard
              key={serial}
              serial={serial}
              events={events}
              busy={applyingSerials.has(serial)}
              onClose={() =>
                setApplyLog((prev) => {
                  const next = new Map(prev);
                  next.delete(serial);
                  return next;
                })
              }
            />
          ))}
      </div>

      <ProfileEditor
        open={editorOpen}
        profile={editingProfile}
        catalog={catalog.data?.apps ?? []}
        onChange={setEditingProfile}
        onSave={saveProfile}
        onCancel={() => {
          setEditorOpen(false);
          setEditingProfile(null);
        }}
      />
    </div>
  );
}

interface ProfileCardProps {
  profile: Profile;
  catalog: CatalogApp[];
  onlineDevices: { serial: string; label: string }[];
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onApply: (serial: string) => void;
}

function ProfileCard({
  profile,
  catalog,
  onlineDevices,
  onEdit,
  onDuplicate,
  onDelete,
  onApply,
}: ProfileCardProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const installCount = profile.install_apps.length;
  const removeCount = profile.remove_packages.length;
  const friendlyApps = useMemo(() => {
    return profile.install_apps.map(
      (id) => catalog.find((a) => a.id === id)?.name ?? id
    );
  }, [profile.install_apps, catalog]);
  const kioskName =
    profile.kiosk_app != null
      ? catalog.find((a) => a.package === profile.kiosk_app)?.name ?? profile.kiosk_app
      : null;

  return (
    <Card className="flex flex-col">
      <CardContent className="p-5 flex-1 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-semibold truncate">{profile.name}</div>
            {profile.username && (
              <div className="text-xs text-muted-foreground truncate">
                User: {profile.username}
              </div>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onEdit} title="Edit">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onDuplicate} title="Duplicate">
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10" onClick={onDelete} title="Delete">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {profile.description && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {profile.description}
          </p>
        )}

        <div className="text-xs space-y-1.5">
          <SummaryLine label="Wi-Fi" value={profile.wifi?.ssid ?? null} />
          <SummaryLine
            label="Installs"
            value={installCount > 0 ? `${installCount} app${installCount === 1 ? "" : "s"}` : null}
            tooltip={friendlyApps.join(", ")}
          />
          <SummaryLine
            label="Removes"
            value={removeCount > 0 ? `${removeCount} package${removeCount === 1 ? "" : "s"}` : null}
          />
          <SummaryLine label="Kiosk lock" value={kioskName} />
        </div>

        <div className="border-t border-border pt-3 mt-auto">
          {pickerOpen ? (
            <div className="space-y-1.5">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Apply to which headset?
              </div>
              {onlineDevices.length === 0 ? (
                <div className="text-xs text-muted-foreground py-2">
                  No headsets online. Plug one in or wait for wireless reconnect.
                </div>
              ) : (
                onlineDevices.map((d) => (
                  <Button
                    key={d.serial}
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => {
                      onApply(d.serial);
                      setPickerOpen(false);
                    }}
                  >
                    <Rocket className="h-3.5 w-3.5 mr-2" />
                    {d.label}
                  </Button>
                ))
              )}
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => setPickerOpen(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              className="w-full"
              onClick={() => setPickerOpen(true)}
              disabled={onlineDevices.length === 0}
            >
              <Rocket className="h-4 w-4 mr-2" />
              Apply to a headset
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryLine({
  label,
  value,
  tooltip,
}: {
  label: string;
  value: string | null;
  tooltip?: string;
}) {
  return (
    <div className="flex items-center gap-2" title={tooltip}>
      <span className="text-muted-foreground w-20 shrink-0">{label}</span>
      {value ? (
        <span className="truncate">{value}</span>
      ) : (
        <span className="text-muted-foreground/60 italic">—</span>
      )}
    </div>
  );
}

function ApplyProgressCard({
  serial,
  events,
  busy,
  onClose,
}: {
  serial: string;
  events: ProfileApplyEvent[];
  busy: boolean;
  onClose: () => void;
}) {
  // Aggregate per-step status from the event stream.
  type Row = { step: string; status: string; message: string };
  const rows: Row[] = [];
  for (const e of events) {
    if (e.type === "step") {
      const existing = rows.find((r) => r.step === e.step);
      if (existing) {
        existing.status = e.status;
        existing.message = e.message;
      } else {
        rows.push({ step: e.step, status: e.status, message: e.message });
      }
    }
  }
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="font-medium text-sm">
            Applying profile to {serial.slice(-6)}
          </div>
          {!busy && (
            <Button variant="ghost" size="sm" onClick={onClose} className="h-6 px-2 text-xs">
              Dismiss
            </Button>
          )}
        </div>
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.step} className="flex items-start gap-2 text-sm">
              <StatusIcon status={r.status} />
              <div className="flex-1 min-w-0">
                <span className="capitalize">{r.step.replace("_", " ")}</span>
                {r.message && (
                  <span className="text-muted-foreground ml-2 text-xs">— {r.message}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "running") return <Loader2 className="h-4 w-4 animate-spin text-primary mt-0.5 shrink-0" />;
  if (status === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />;
  if (status === "fail") return <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />;
  if (status === "skipped") return <Circle className="h-4 w-4 text-muted-foreground/50 mt-0.5 shrink-0" />;
  return <Circle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />;
}

interface EditorProps {
  open: boolean;
  profile: Profile | null;
  catalog: CatalogApp[];
  onChange: (p: Profile) => void;
  onSave: () => void;
  onCancel: () => void;
}

function ProfileEditor({ open, profile, catalog, onChange, onSave, onCancel }: EditorProps) {
  if (!profile) return null;

  function set<K extends keyof Profile>(key: K, value: Profile[K]) {
    onChange({ ...profile!, [key]: value });
  }

  function toggleAppInstall(id: string) {
    const next = profile!.install_apps.includes(id)
      ? profile!.install_apps.filter((x) => x !== id)
      : [...profile!.install_apps, id];
    set("install_apps", next);
  }

  function toggleRemovePackage(pkg: string) {
    const next = profile!.remove_packages.includes(pkg)
      ? profile!.remove_packages.filter((x) => x !== pkg)
      : [...profile!.remove_packages, pkg];
    set("remove_packages", next);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{profile.name ? `Edit ${profile.name}` : "New profile"}</DialogTitle>
          <DialogDescription>
            Save a setup so you can apply it to any headset with one click.
            Most fields are optional — only Name is required.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Basic info */}
          <Section title="Basic info">
            <Field label="Profile name" required>
              <Input
                value={profile.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Library Stations"
              />
            </Field>
            <Field
              label="Local username"
              hint="Just for naming — never sent to Meta. Combined with the headset's serial tail to make a distinctive display name like 'Mrs-Smith #2145'."
            >
              <Input
                value={profile.username}
                onChange={(e) => set("username", e.target.value)}
                placeholder="Mrs-Smith"
              />
            </Field>
            <Field
              label="Description"
              hint="What this profile is for, in your own words."
            >
              <Input
                value={profile.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Free-time stations in the library — only games, no browser."
              />
            </Field>
          </Section>

          {/* Wi-Fi */}
          <Section title="Wi-Fi push (optional)">
            <div className="text-xs text-muted-foreground mb-2">
              When set, the headset will be joined to this network during apply.
              Leave the SSID blank to skip the Wi-Fi step.
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="SSID">
                <Input
                  value={profile.wifi?.ssid ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) {
                      set("wifi", null);
                    } else {
                      set("wifi", {
                        ssid: v,
                        psk: profile.wifi?.psk ?? "",
                        security: profile.wifi?.security ?? "wpa2psk",
                        auto_connect: profile.wifi?.auto_connect ?? true,
                      });
                    }
                  }}
                  placeholder="School-Staff"
                />
              </Field>
              <Field label="Password">
                <Input
                  type="password"
                  value={profile.wifi?.psk ?? ""}
                  onChange={(e) =>
                    profile.wifi &&
                    set("wifi", { ...profile.wifi, psk: e.target.value })
                  }
                  disabled={!profile.wifi}
                />
              </Field>
            </div>
          </Section>

          {/* Apps to install */}
          <Section title={`Apps to install (${profile.install_apps.length})`}>
            <div className="text-xs text-muted-foreground mb-2">
              Pick from the curated catalog. These will be installed during
              apply, in order.
            </div>
            {catalog.length === 0 ? (
              <div className="text-sm text-muted-foreground py-2">
                Catalog isn't loaded yet. Open Apps → Browse Catalog and click
                "Refresh catalog" once, then come back here.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-60 overflow-y-auto">
                {catalog.map((a) => {
                  const checked = profile.install_apps.includes(a.id);
                  return (
                    <label
                      key={a.id}
                      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer transition-colors ${
                        checked
                          ? "bg-primary/10 border border-primary/40"
                          : "border border-transparent hover:bg-accent"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAppInstall(a.id)}
                        className="shrink-0"
                      />
                      <span className="truncate">{a.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </Section>

          {/* Apps to remove */}
          <Section title={`Apps to remove (${profile.remove_packages.length})`}>
            <div className="text-xs text-muted-foreground mb-2">
              Quick-pick common Meta bloatware. Leave any unchecked to keep them.
            </div>
            <div className="space-y-1.5">
              {COMMON_REMOVE_PACKAGES.map((p) => {
                const checked = profile.remove_packages.includes(p.pkg);
                return (
                  <label
                    key={p.pkg}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleRemovePackage(p.pkg)}
                    />
                    <span>{p.label}</span>
                    <span className="text-muted-foreground text-xs font-mono">
                      ({p.pkg})
                    </span>
                  </label>
                );
              })}
            </div>
          </Section>

          {/* Kiosk lock */}
          <Section title="Default kiosk lock (optional)">
            <div className="text-xs text-muted-foreground mb-2">
              If set, the headset will be locked to this app immediately after
              apply. Pick a package this profile installs, or leave blank to
              not lock by default.
            </div>
            <select
              className="w-full bg-background border border-border rounded-md px-2 py-2 text-sm"
              value={profile.kiosk_app ?? ""}
              onChange={(e) => set("kiosk_app", e.target.value || null)}
            >
              <option value="">— No kiosk lock —</option>
              {profile.install_apps.map((id) => {
                const cat = catalog.find((a) => a.id === id);
                if (!cat?.package) return null;
                return (
                  <option key={cat.package} value={cat.package}>
                    {cat.name}
                  </option>
                );
              })}
            </select>
          </Section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={!profile.name.trim()}>
            Save profile
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{title}</div>
      {children}
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      {children}
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
