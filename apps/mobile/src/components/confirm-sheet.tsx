import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

/**
 * TIFFINO-themed replacements for the native Alert popups:
 *   confirm(opts)  → Promise<boolean>        (yes/no sheet)
 *   notice(title, message?) → Promise<void>  (ok-only sheet, e.g. bulk results)
 *   actions(title, subtitle, items) → Promise<number | null>  (action list sheet)
 * Backdrop tap dismisses (resolves false / null).
 */

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'forest' | 'flame' | 'danger';
}

export interface ActionItem {
  label: string;
  caption?: string;
  tone?: 'default' | 'danger';
}

type DialogState =
  | { kind: 'confirm'; opts: ConfirmOptions }
  | { kind: 'notice'; title: string; message?: string }
  | { kind: 'actions'; title: string; subtitle?: string; items: ActionItem[] };

interface ConfirmSheetApi {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  notice: (title: string, message?: string) => Promise<void>;
  actions: (title: string, subtitle: string | undefined, items: ActionItem[]) => Promise<number | null>;
}

const Ctx = createContext<ConfirmSheetApi | null>(null);

export function ConfirmSheetProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const resolver = useRef<((value: never) => void) | null>(null);

  const settle = useCallback((value: boolean | number | null | undefined) => {
    const resolve = resolver.current as ((v: typeof value) => void) | null;
    resolver.current = null;
    setDialog(null);
    resolve?.(value);
  }, []);

  const open = useCallback(
    <T,>(state: DialogState): Promise<T> => {
      // A second dialog supersedes the first: settle it as dismissed.
      (resolver.current as ((v: null) => void) | null)?.(null);
      setDialog(state);
      return new Promise<T>((resolve) => {
        resolver.current = resolve as (value: never) => void;
      });
    },
    [],
  );

  const api: ConfirmSheetApi = {
    confirm: (opts) => open<boolean>({ kind: 'confirm', opts }).then((v) => v === true),
    notice: (title, message) => open<void>({ kind: 'notice', title, message }).then(() => undefined),
    actions: (title, subtitle, items) =>
      open<number | null>({ kind: 'actions', title, subtitle, items }).then((v) =>
        typeof v === 'number' ? v : null,
      ),
  };

  const tone = dialog?.kind === 'confirm' ? (dialog.opts.tone ?? 'forest') : 'forest';
  const confirmBg =
    tone === 'danger' ? 'bg-danger' : tone === 'flame' ? 'bg-flame-500' : 'bg-forest-800';

  return (
    <Ctx.Provider value={api}>
      {children}
      <Modal
        visible={dialog !== null}
        transparent
        animationType="slide"
        onRequestClose={() => settle(dialog?.kind === 'confirm' ? false : null)}>
        <Pressable
          className="flex-1 bg-charcoal/50"
          accessibilityLabel="Close"
          onPress={() => settle(dialog?.kind === 'confirm' ? false : null)}
        />
        <View className="rounded-t-3xl bg-cream px-5 pb-10 pt-3">
          <View className="mb-3 h-1.5 w-12 self-center rounded-full bg-charcoal/15" />

          {dialog?.kind === 'confirm' ? (
            <>
              <Text className="text-lg font-extrabold text-forest-800">{dialog.opts.title}</Text>
              {dialog.opts.message ? (
                <Text className="mt-1.5 text-sm leading-5 text-charcoal/60">
                  {dialog.opts.message}
                </Text>
              ) : null}
              <View className="mt-5 flex-row" style={{ gap: 10 }}>
                <Pressable
                  onPress={() => settle(false)}
                  accessibilityRole="button"
                  className="min-h-[50px] flex-1 items-center justify-center rounded-2xl bg-white active:bg-forest-50">
                  <Text className="text-sm font-bold text-charcoal/60">
                    {dialog.opts.cancelLabel ?? 'Not now'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => settle(true)}
                  accessibilityRole="button"
                  className={`min-h-[50px] flex-1 items-center justify-center rounded-2xl ${confirmBg} active:opacity-90`}>
                  <Text className="text-sm font-extrabold text-white">
                    {dialog.opts.confirmLabel ?? 'Confirm'}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : null}

          {dialog?.kind === 'notice' ? (
            <>
              <Text className="text-lg font-extrabold text-forest-800">{dialog.title}</Text>
              {dialog.message ? (
                <Text className="mt-1.5 text-sm leading-5 text-charcoal/60">{dialog.message}</Text>
              ) : null}
              <Pressable
                onPress={() => settle(undefined)}
                accessibilityRole="button"
                className="mt-5 min-h-[50px] items-center justify-center rounded-2xl bg-forest-800 active:opacity-90">
                <Text className="text-sm font-extrabold text-white">OK</Text>
              </Pressable>
            </>
          ) : null}

          {dialog?.kind === 'actions' ? (
            <>
              <Text className="text-lg font-extrabold text-forest-800">{dialog.title}</Text>
              {dialog.subtitle ? (
                <Text className="mt-0.5 text-xs text-charcoal/55">{dialog.subtitle}</Text>
              ) : null}
              <View className="mt-4" style={{ gap: 8 }}>
                {dialog.items.map((item, idx) => (
                  <Pressable
                    key={item.label}
                    onPress={() => settle(idx)}
                    accessibilityRole="button"
                    className="min-h-[52px] flex-row items-center justify-between rounded-2xl bg-white px-4 active:bg-forest-50">
                    <View className="mr-2 flex-1">
                      <Text
                        className={`text-base font-bold ${item.tone === 'danger' ? 'text-danger' : 'text-charcoal'}`}>
                        {item.label}
                      </Text>
                      {item.caption ? (
                        <Text className="mt-0.5 text-xs text-charcoal/45">{item.caption}</Text>
                      ) : null}
                    </View>
                    <Text className="text-charcoal/25">›</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                onPress={() => settle(null)}
                accessibilityRole="button"
                className="mt-3 min-h-[46px] items-center justify-center rounded-2xl">
                <Text className="text-sm font-bold text-charcoal/50">Close</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </Modal>
    </Ctx.Provider>
  );
}

export function useConfirmSheet(): ConfirmSheetApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useConfirmSheet must be used inside <ConfirmSheetProvider>');
  return ctx;
}
