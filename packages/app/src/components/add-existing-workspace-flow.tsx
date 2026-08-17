import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { useFetchQuery } from "@/data/query";
import { Check, ChevronDown, FolderGit2, GitBranch, HardDrive } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { HostStatusDot } from "@/components/host-status-dot";
import { HostPicker } from "@/components/hosts/host-picker";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useToast } from "@/contexts/toast-context";
import {
  buildExistingWorkspacePathOptions,
  existingWorkspacePathKey,
  isMatchingCheckoutRepository,
  type ExistingWorkspacePathOption,
} from "@/existing-workspace/model";
import { useHostRuntimeClient, useHostRuntimeIsConnected, useHosts } from "@/runtime/host-runtime";
import {
  normalizeWorkspaceDescriptor,
  useSessionStore,
  type WorkspaceDescriptor,
} from "@/stores/session-store";
import {
  useAddExistingWorkspaceStore,
  type AddExistingWorkspaceRequest,
} from "@/stores/add-existing-workspace-store";
import { navigateToWorkspace } from "@/stores/navigation-active-workspace-store";
import type { Theme } from "@/styles/theme";
import { toErrorMessage } from "@/utils/error-messages";
import { shortenPath } from "@/utils/shorten-path";

const EMPTY_WORKSPACES: ReadonlyMap<string, WorkspaceDescriptor> = new Map();
const SNAP_POINTS = ["75%", "92%"];
const foregroundMutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const foregroundMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const ThemedCheck = withUnistyles(Check);
const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedFolderGit2 = withUnistyles(FolderGit2);
const ThemedGitBranch = withUnistyles(GitBranch);
const ThemedHardDrive = withUnistyles(HardDrive);
const ThemedLoadingSpinner = withUnistyles(LoadingSpinner);

type CheckoutStatus = Awaited<ReturnType<DaemonClient["getCheckoutStatus"]>>;

function branchLabel(
  option: ExistingWorkspacePathOption,
  detachedLabel: string,
  directoryLabel: string,
): string {
  if (option.worktree?.branch) return option.worktree.branch;
  if (option.worktree) return detachedLabel;
  return directoryLabel;
}

function selectedPathError(input: {
  option: ExistingWorkspacePathOption | null;
  sourceMainRepoRoot: string | null | undefined;
  candidateStatus: CheckoutStatus | undefined;
  notGitLabel: string;
  differentRepositoryLabel: string;
  unavailableLabel: string;
}): string | null {
  if (!input.option) return null;
  if (input.option.worktree?.isPrunable) return input.unavailableLabel;
  if (input.candidateStatus?.error) return input.candidateStatus.error.message;
  if (input.candidateStatus && !input.candidateStatus.isGit) return input.notGitLabel;
  if (
    input.sourceMainRepoRoot &&
    input.candidateStatus &&
    !isMatchingCheckoutRepository(
      {
        isGit: true,
        repoRoot: input.sourceMainRepoRoot,
        mainRepoRoot: input.sourceMainRepoRoot,
      },
      input.candidateStatus,
    )
  ) {
    return input.differentRepositoryLabel;
  }
  return null;
}

function ExistingWorkspaceRow({
  option,
  selected,
  disabled,
  onSelect,
}: {
  option: ExistingWorkspacePathOption;
  selected: boolean;
  disabled: boolean;
  onSelect: (option: ExistingWorkspacePathOption) => void;
}) {
  const { t } = useTranslation();
  const rowStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.optionRow,
      selected && styles.optionRowSelected,
      (hovered || pressed) && !disabled && styles.optionRowHovered,
      disabled && styles.optionRowDisabled,
    ],
    [disabled, selected],
  );
  const label = branchLabel(
    option,
    t("existingWorkspace.detachedHead"),
    option.source === "manual"
      ? t("existingWorkspace.manualPath")
      : t("existingWorkspace.directory"),
  );
  let ownership: string | null = null;
  if (option.worktree?.isPrunable) {
    ownership = t("existingWorkspace.unavailable");
  } else if (option.worktree?.isPaseoOwnedWorktree) {
    ownership = t("existingWorkspace.paseoManaged");
  } else if (option.worktree?.isMainCheckout) {
    ownership = t("existingWorkspace.mainWorktree");
  } else if (option.worktree) {
    ownership = t("existingWorkspace.external");
  }
  const accessibilityState = useMemo(() => ({ disabled, selected }), [disabled, selected]);
  const handlePress = useCallback(() => onSelect(option), [onSelect, option]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      disabled={disabled}
      onPress={handlePress}
      style={rowStyle}
      testID={`existing-workspace-option-${encodeURIComponent(option.path)}`}
    >
      <View style={styles.optionIcon}>
        {option.worktree ? (
          <ThemedFolderGit2 size={16} uniProps={foregroundMutedMapping} />
        ) : (
          <ThemedHardDrive size={16} uniProps={foregroundMutedMapping} />
        )}
      </View>
      <View style={styles.optionText}>
        <View style={styles.optionTitleRow}>
          <Text style={styles.optionTitle} numberOfLines={1}>
            {label}
          </Text>
          {ownership ? <Text style={styles.optionMeta}>{ownership}</Text> : null}
        </View>
        <Text style={styles.optionPath} numberOfLines={1}>
          {shortenPath(option.path)}
        </Text>
      </View>
      <View style={styles.optionCheck}>
        {selected ? <ThemedCheck size={16} uniProps={foregroundMapping} /> : null}
      </View>
    </Pressable>
  );
}

function HostControl({
  request,
  selectedServerId,
  onSelect,
  disabled,
}: {
  request: AddExistingWorkspaceRequest;
  selectedServerId: string;
  onSelect: (serverId: string) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const allHosts = useHosts();
  const anchorRef = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const targetIds = useMemo(
    () => new Set(request.targets.map((target) => target.serverId)),
    [request.targets],
  );
  const hosts = useMemo(
    () => allHosts.filter((host) => targetIds.has(host.serverId)),
    [allHosts, targetIds],
  );
  const selectedLabel =
    hosts.find((host) => host.serverId === selectedServerId)?.label ?? selectedServerId;
  const triggerStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.hostTrigger,
      (hovered || pressed) && styles.hostTriggerHovered,
    ],
    [],
  );
  const handleOpen = useCallback(() => setOpen(true), []);

  if (hosts.length <= 1) return null;

  return (
    <HostPicker
      hosts={hosts}
      value={selectedServerId}
      onSelect={onSelect}
      open={open}
      onOpenChange={setOpen}
      anchorRef={anchorRef}
      title={t("existingWorkspace.host")}
      desktopMinWidth={240}
    >
      <Pressable
        ref={anchorRef}
        accessibilityRole="button"
        accessibilityLabel={t("existingWorkspace.host")}
        disabled={disabled}
        onPress={handleOpen}
        style={triggerStyle}
        testID="existing-workspace-host-trigger"
      >
        <View style={styles.hostIcon}>
          <HostStatusDot serverId={selectedServerId} />
        </View>
        <Text style={styles.hostLabel} numberOfLines={1}>
          {selectedLabel}
        </Text>
        <ThemedChevronDown size={14} uniProps={foregroundMutedMapping} />
      </Pressable>
    </HostPicker>
  );
}

// oxlint-disable-next-line complexity
export function AddExistingWorkspaceFlow({
  request,
  onClose,
}: {
  request: AddExistingWorkspaceRequest;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const hosts = useHosts();
  const initialTarget =
    request.targets.find((target) => target.serverId === request.preferredServerId) ??
    request.targets[0];
  const [selectedServerId, setSelectedServerId] = useState(initialTarget?.serverId ?? "");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedOption, setSelectedOption] = useState<ExistingWorkspacePathOption | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const target =
    request.targets.find((candidate) => candidate.serverId === selectedServerId) ?? initialTarget;
  const client = useHostRuntimeClient(selectedServerId);
  const isConnected = useHostRuntimeIsConnected(selectedServerId);
  const mergeWorkspaces = useSessionStore((state) => state.mergeWorkspaces);
  const workspaces = useSessionStore(
    (state) => state.sessions[selectedServerId]?.workspaces ?? EMPTY_WORKSPACES,
  );
  const hostLabel = hosts.find((host) => host.serverId === selectedServerId)?.label;

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(query.trim()), 180);
    return () => clearTimeout(timeout);
  }, [query]);

  const queryEnabled = Boolean(client && isConnected && target);
  const worktreesQuery = useFetchQuery({
    queryKey: ["checkoutWorktrees", selectedServerId, target?.sourceDirectory],
    queryFn: async () => {
      if (!client || !target) throw new Error(t("existingWorkspace.errors.hostDisconnected"));
      const payload = await client.getCheckoutWorktrees(target.sourceDirectory);
      if (payload.error) throw new Error(payload.error.message);
      if (!payload.mainRepoRoot) {
        throw new Error(t("existingWorkspace.errors.notGit"));
      }
      return payload;
    },
    enabled: queryEnabled,
    dataShape: "value",
    retry: false,
    staleTimeMs: 15_000,
  });
  const directoryQuery = useFetchQuery({
    queryKey: ["existingWorkspaceDirectories", selectedServerId, debouncedQuery],
    queryFn: async () => {
      if (!client) throw new Error(t("existingWorkspace.errors.hostDisconnected"));
      const payload = await client.getDirectorySuggestions({
        query: debouncedQuery,
        includeDirectories: true,
        includeFiles: false,
        limit: 30,
      });
      if (payload.error) throw new Error(payload.error);
      return payload.entries.flatMap((entry) => (entry.kind === "directory" ? [entry.path] : []));
    },
    enabled: queryEnabled && debouncedQuery.length > 0,
    dataShape: "value",
    retry: false,
    staleTimeMs: 15_000,
  });
  const options = useMemo(
    () =>
      buildExistingWorkspacePathOptions({
        worktrees: worktreesQuery.data?.worktrees ?? [],
        directorySuggestions: directoryQuery.data ?? [],
        query,
      }),
    [directoryQuery.data, query, worktreesQuery.data],
  );
  const selectedPath = selectedOption?.path ?? null;
  const candidateStatusQuery = useFetchQuery({
    queryKey: ["existingWorkspaceCandidateStatus", selectedServerId, selectedPath],
    queryFn: async () => {
      if (!client || !selectedPath) throw new Error(t("existingWorkspace.errors.hostDisconnected"));
      return client.getCheckoutStatus(selectedPath);
    },
    enabled: queryEnabled && Boolean(selectedPath),
    dataShape: "value",
    retry: false,
    staleTimeMs: 5_000,
  });

  const existingWorkspace = useMemo(() => {
    if (!selectedPath) return null;
    const selectedKey = existingWorkspacePathKey(selectedPath);
    for (const workspace of workspaces.values()) {
      if (existingWorkspacePathKey(workspace.workspaceDirectory) === selectedKey) return workspace;
    }
    return null;
  }, [selectedPath, workspaces]);

  const validationError = selectedPathError({
    option: selectedOption,
    sourceMainRepoRoot: worktreesQuery.data?.mainRepoRoot,
    candidateStatus: candidateStatusQuery.data,
    notGitLabel: t("existingWorkspace.errors.notGit"),
    differentRepositoryLabel: t("existingWorkspace.errors.differentRepository"),
    unavailableLabel: t("existingWorkspace.errors.prunable"),
  });
  const selectedStatus = candidateStatusQuery.data;
  const isMainWorktree = Boolean(
    selectedOption?.worktree?.isMainCheckout ||
    (selectedStatus?.isGit &&
      existingWorkspacePathKey(selectedStatus.repoRoot) ===
        existingWorkspacePathKey(selectedStatus.mainRepoRoot ?? selectedStatus.repoRoot)),
  );
  let selectedOwnership = t("existingWorkspace.external");
  if (selectedStatus?.isPaseoOwnedWorktree) {
    selectedOwnership = t("existingWorkspace.paseoManaged");
  } else if (isMainWorktree) {
    selectedOwnership = t("existingWorkspace.mainWorktree");
  }
  const previewLoading = Boolean(selectedPath && candidateStatusQuery.isFetching);
  const canSubmit = Boolean(
    target &&
    client &&
    isConnected &&
    selectedPath &&
    selectedStatus &&
    worktreesQuery.data?.mainRepoRoot &&
    !previewLoading &&
    !validationError,
  );

  const handleSelectHost = useCallback((serverId: string) => {
    setSelectedServerId(serverId);
    setQuery("");
    setDebouncedQuery("");
    setSelectedOption(null);
  }, []);
  const handleSelectOption = useCallback(
    (option: ExistingWorkspacePathOption) => setSelectedOption(option),
    [],
  );
  const handleClose = useCallback(() => {
    if (!isSubmitting) onClose();
  }, [isSubmitting, onClose]);
  const handleSubmit = useCallback(() => {
    if (!canSubmit || !target || !client || !selectedPath) return;
    if (existingWorkspace) {
      onClose();
      navigateToWorkspace({ serverId: selectedServerId, workspaceId: existingWorkspace.id });
      return;
    }

    setIsSubmitting(true);
    void (async () => {
      try {
        const payload = await client.createWorkspace({
          source: { kind: "directory", path: selectedPath, projectId: target.projectId },
        });
        if (payload.error || !payload.workspace) {
          throw new Error(payload.error ?? t("existingWorkspace.errors.createFailed"));
        }
        const workspace = normalizeWorkspaceDescriptor(payload.workspace);
        mergeWorkspaces(selectedServerId, [workspace]);
        onClose();
        navigateToWorkspace({ serverId: selectedServerId, workspaceId: workspace.id });
      } catch (error) {
        toast.error(toErrorMessage(error));
      } finally {
        setIsSubmitting(false);
      }
    })();
  }, [
    canSubmit,
    client,
    existingWorkspace,
    mergeWorkspaces,
    onClose,
    selectedPath,
    selectedServerId,
    t,
    target,
    toast,
  ]);

  const header = useMemo<SheetHeader>(
    () => ({
      title: t("existingWorkspace.title"),
      subtitle: (
        <Text style={styles.headerSubtitle} numberOfLines={1}>
          {hostLabel
            ? t("existingWorkspace.subtitleWithHost", {
                project: request.projectName,
                host: hostLabel,
              })
            : request.projectName}
        </Text>
      ),
      search: {
        onChange: setQuery,
        resetKey: selectedServerId,
        placeholder: t("existingWorkspace.searchPlaceholder"),
        autoFocus: true,
        testID: "existing-workspace-search",
      },
    }),
    [hostLabel, request.projectName, selectedServerId, t],
  );
  const footer = useMemo(
    () => (
      <View style={styles.footer}>
        <Button variant="secondary" size="md" style={styles.footerButton} onPress={handleClose}>
          {t("common.actions.cancel")}
        </Button>
        <Button
          variant="default"
          size="md"
          style={styles.footerButton}
          onPress={handleSubmit}
          disabled={!canSubmit}
          loading={isSubmitting}
          testID="existing-workspace-submit"
        >
          {existingWorkspace
            ? t("existingWorkspace.openWorkspace")
            : t("existingWorkspace.addWorkspace")}
        </Button>
      </View>
    ),
    [canSubmit, existingWorkspace, handleClose, handleSubmit, isSubmitting, t],
  );
  const loading =
    worktreesQuery.isLoading || (debouncedQuery.length > 0 && directoryQuery.isLoading);
  const queryError = worktreesQuery.error ?? directoryQuery.error;
  let queryErrorMessage: string | null = null;
  if (!isConnected) {
    queryErrorMessage = t("existingWorkspace.errors.hostDisconnected");
  } else if (queryError) {
    queryErrorMessage = toErrorMessage(queryError);
  }

  return (
    <AdaptiveModalSheet
      visible
      onClose={handleClose}
      header={header}
      footer={footer}
      desktopMaxWidth={620}
      snapPoints={SNAP_POINTS}
      testID="add-existing-workspace-flow"
    >
      {target ? (
        <HostControl
          request={request}
          selectedServerId={selectedServerId}
          onSelect={handleSelectHost}
          disabled={isSubmitting}
        />
      ) : null}

      <View style={styles.listHeader}>
        <Text style={styles.sectionTitle}>{t("existingWorkspace.availableWorktrees")}</Text>
        {loading ? <ThemedLoadingSpinner size="small" uniProps={foregroundMutedMapping} /> : null}
      </View>

      {queryErrorMessage ? <Text style={styles.errorText}>{queryErrorMessage}</Text> : null}
      {!loading && !queryErrorMessage && options.length === 0 ? (
        <View style={styles.emptyState}>
          <ThemedFolderGit2 size={20} uniProps={foregroundMutedMapping} />
          <Text style={styles.emptyText}>{t("existingWorkspace.empty")}</Text>
        </View>
      ) : null}
      <View style={styles.optionList}>
        {options.map((option) => (
          <ExistingWorkspaceRow
            key={option.id}
            option={option}
            selected={
              existingWorkspacePathKey(option.path) ===
              existingWorkspacePathKey(selectedOption?.path ?? "")
            }
            disabled={isSubmitting || option.worktree?.isPrunable === true}
            onSelect={handleSelectOption}
          />
        ))}
      </View>

      {selectedOption ? (
        <View style={styles.preview} testID="existing-workspace-preview">
          <View style={styles.previewTitleRow}>
            <ThemedGitBranch size={16} uniProps={foregroundMutedMapping} />
            <Text style={styles.previewTitle}>{t("existingWorkspace.selection")}</Text>
            {previewLoading ? (
              <ThemedLoadingSpinner size="small" uniProps={foregroundMutedMapping} />
            ) : null}
          </View>
          <Text style={styles.previewPath} selectable numberOfLines={2}>
            {selectedOption.path}
          </Text>
          {selectedStatus?.isGit ? (
            <View style={styles.previewMetadata}>
              <Text style={styles.previewMeta}>
                {selectedStatus.currentBranch ?? t("existingWorkspace.detachedHead")}
              </Text>
              {selectedStatus.isDirty !== null ? (
                <Text style={styles.previewMeta}>
                  {selectedStatus.isDirty
                    ? t("existingWorkspace.dirty")
                    : t("existingWorkspace.clean")}
                </Text>
              ) : null}
              <Text style={styles.previewMeta}>{selectedOwnership}</Text>
              {existingWorkspace ? (
                <Text style={styles.previewMeta}>{t("existingWorkspace.alreadyAdded")}</Text>
              ) : null}
            </View>
          ) : null}
          {validationError ? <Text style={styles.errorText}>{validationError}</Text> : null}
        </View>
      ) : null}
    </AdaptiveModalSheet>
  );
}

export function AddExistingWorkspaceHost() {
  const request = useAddExistingWorkspaceStore((state) => state.request);
  const close = useAddExistingWorkspaceStore((state) => state.close);
  if (!request) return null;
  return <AddExistingWorkspaceFlow key={request.id} request={request} onClose={close} />;
}

const styles = StyleSheet.create((theme) => ({
  headerSubtitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  hostTrigger: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
  },
  hostTriggerHovered: {
    backgroundColor: theme.colors.surface2,
  },
  hostIcon: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  hostLabel: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  listHeader: {
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  sectionTitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    textTransform: "uppercase",
  },
  optionList: {
    gap: theme.spacing[1],
  },
  optionRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  optionRowSelected: {
    backgroundColor: theme.colors.surface2,
    borderColor: theme.colors.borderAccent,
  },
  optionRowHovered: {
    backgroundColor: theme.colors.surface2,
  },
  optionRowDisabled: {
    opacity: 0.45,
  },
  optionIcon: {
    width: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  optionText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  optionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  optionTitle: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  optionMeta: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  optionPath: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  optionCheck: {
    width: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    minHeight: 88,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[2],
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  preview: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing[4],
    gap: theme.spacing[2],
  },
  previewTitleRow: {
    minHeight: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  previewTitle: {
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  previewPath: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  previewMetadata: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[3],
  },
  previewMeta: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  errorText: {
    color: theme.colors.palette.red[300],
    fontSize: theme.fontSize.sm,
  },
  footer: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  footerButton: {
    flex: 1,
  },
}));
