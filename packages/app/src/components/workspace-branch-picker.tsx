import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { Check, GitBranch } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useToast } from "@/contexts/toast-context";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import {
  useWorkspaceBranchPickerStore,
  type WorkspaceBranchPickerRequest,
} from "@/stores/workspace-branch-picker-store";
import type { Theme } from "@/styles/theme";

const SNAP_POINTS = ["65%", "88%"];
const foregroundMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const foregroundMutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const ThemedCheck = withUnistyles(Check);
const ThemedGitBranch = withUnistyles(GitBranch);
const ThemedLoadingSpinner = withUnistyles(LoadingSpinner);

function BranchRow({
  branch,
  selected,
  onSelect,
}: {
  branch: string;
  selected: boolean;
  onSelect: (branch: string) => void;
}) {
  const style = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.row,
      selected && styles.rowSelected,
      (hovered || pressed) && styles.rowHovered,
    ],
    [selected],
  );
  const accessibilityState = useMemo(() => ({ selected }), [selected]);
  const handlePress = useCallback(() => onSelect(branch), [branch, onSelect]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      onPress={handlePress}
      style={style}
      testID={`workspace-branch-picker-option-${branch}`}
    >
      <View style={styles.iconSlot}>
        <ThemedGitBranch size={16} uniProps={foregroundMutedMapping} />
      </View>
      <Text style={styles.label} numberOfLines={1}>
        {branch}
      </Text>
      <View style={styles.checkSlot}>
        {selected ? <ThemedCheck size={16} uniProps={foregroundMapping} /> : null}
      </View>
    </Pressable>
  );
}

export function WorkspaceBranchPicker({
  request,
  onClose,
}: {
  request: WorkspaceBranchPickerRequest;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const client = useHostRuntimeClient(request.serverId);
  const isConnected = useHostRuntimeIsConnected(request.serverId);
  const toast = useToast();
  const queryClient = useQueryClient();
  const { branchOptions, isLoading, error, setIsOpen, handleBranchSelect } = useBranchSwitcher({
    client,
    normalizedServerId: request.serverId,
    normalizedWorkspaceId: request.workspaceId,
    workspaceDirectory: request.workspaceDirectory,
    currentBranchName: request.currentBranch,
    isGitCheckout: true,
    isConnected,
    toast,
    queryClient,
  });

  useEffect(() => {
    setIsOpen(true);
    return () => setIsOpen(false);
  }, [setIsOpen]);

  const visibleBranches = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized
      ? branchOptions.filter((option) => option.label.toLocaleLowerCase().includes(normalized))
      : branchOptions;
  }, [branchOptions, query]);
  let errorMessage: string | null = null;
  if (!isConnected) {
    errorMessage = t("common.errors.daemonClientDisconnected");
  } else if (!client) {
    errorMessage = t("common.errors.daemonClientUnavailable");
  } else if (error) {
    errorMessage = error.message;
  }
  const selectBranch = useCallback(
    (branch: string) => {
      handleBranchSelect(branch);
      onClose();
    },
    [handleBranchSelect, onClose],
  );
  const header = useMemo<SheetHeader>(
    () => ({
      title: t("branchSwitcher.title"),
      search: {
        onChange: setQuery,
        placeholder: t("branchSwitcher.searchPlaceholder"),
        autoFocus: true,
        testID: "workspace-branch-picker-search",
      },
    }),
    [t],
  );

  return (
    <AdaptiveModalSheet
      visible
      onClose={onClose}
      header={header}
      desktopMaxWidth={480}
      snapPoints={SNAP_POINTS}
      testID="workspace-branch-picker"
    >
      {isLoading ? (
        <View style={styles.state}>
          <ThemedLoadingSpinner size="small" uniProps={foregroundMutedMapping} />
        </View>
      ) : null}
      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
      {!isLoading && !errorMessage && visibleBranches.length === 0 ? (
        <Text style={styles.empty}>{t("branchSwitcher.empty")}</Text>
      ) : null}
      <View style={styles.list}>
        {visibleBranches.map((option) => (
          <BranchRow
            key={option.id}
            branch={option.id}
            selected={option.id === request.currentBranch}
            onSelect={selectBranch}
          />
        ))}
      </View>
    </AdaptiveModalSheet>
  );
}

export function WorkspaceBranchPickerHost() {
  const request = useWorkspaceBranchPickerStore((state) => state.request);
  const close = useWorkspaceBranchPickerStore((state) => state.close);
  if (!request) return null;
  return <WorkspaceBranchPicker key={request.id} request={request} onClose={close} />;
}

const styles = StyleSheet.create((theme) => ({
  list: {
    gap: theme.spacing[1],
  },
  row: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
  },
  rowSelected: {
    backgroundColor: theme.colors.surface2,
  },
  rowHovered: {
    backgroundColor: theme.colors.surface2,
  },
  iconSlot: {
    width: 18,
    alignItems: "center",
  },
  label: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  checkSlot: {
    width: 18,
    alignItems: "center",
  },
  state: {
    minHeight: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    minHeight: 80,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
    textAlignVertical: "center",
  },
  error: {
    color: theme.colors.palette.red[300],
    fontSize: theme.fontSize.sm,
  },
}));
