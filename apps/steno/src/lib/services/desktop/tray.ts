import { Menu, MenuItem, PredefinedMenuItem } from '@tauri-apps/api/menu';
import { resolveResource } from '@tauri-apps/api/path';
import { TrayIcon } from '@tauri-apps/api/tray';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { emit } from '@tauri-apps/api/event';
import { exit } from '@tauri-apps/plugin-process';
import { createTaggedError, extractErrorMessage } from 'wellcrafted/error';
import { commandCallbacks } from '$lib/commands';
import { tryAsync } from 'wellcrafted/result';
import type { StenoRecordingState } from '$lib/constants/audio';

const TRAY_ID = 'steno-tray';

const { SetTrayIconServiceErr } = createTaggedError('SetTrayIconServiceError');

const trayPromise = initTray().catch((err) => {
	console.error('[tray] Failed to initialize tray:', err);
	return null;
});

export const TrayIconServiceLive = {
	setTrayIcon: (recorderState: StenoRecordingState) =>
		tryAsync({
			try: async () => {
				const iconPath = await getIconPath(recorderState);
				const tray = await trayPromise;
				if (!tray) return;
				return tray.setIcon(iconPath);
			},
			catch: (error) =>
				SetTrayIconServiceErr({
					message: `Failed to set tray icon: ${extractErrorMessage(error)}`,
				}),
		}),
};

export type TrayIconService = typeof TrayIconServiceLive;

/**
 * Reliably bring the main window to the foreground.
 *
 * `show()` + `setFocus()` alone isn't enough: a window that the user
 * OS-minimized still needs `unminimize()`, and a window left at the tiny 72×84
 * "mini mode" size would reappear as an unusable sliver. So we unminimize,
 * restore a usable size + recenter when it's stuck in mini mode, then show and
 * focus. Used by both the tray left-click and the tray Settings item.
 */
async function showMainWindow() {
	const appWindow = getCurrentWindow();

	// Restore a usable size if the window is stuck in mini mode, so showing it
	// from the tray doubles as an escape hatch out of mini mode.
	try {
		const size = await appWindow.innerSize();
		const scale = await appWindow.scaleFactor();
		if (size.width / scale < 200) {
			await appWindow.setSize(new LogicalSize(720, 600));
			await appWindow.center();
		}
	} catch {
		// Size probing is best-effort; never let it block showing the window.
	}

	await appWindow.show();
	await appWindow.unminimize();
	await appWindow.setFocus();
}

async function initTray() {
	// Remove any tray left over from a previous webview load (e.g. a dev
	// Ctrl+R reload). Returning the existing tray would keep its menu/action
	// handlers bound to the now-destroyed JS context, so clicks would silently
	// do nothing. Recreating re-binds the handlers to the current context.
	await TrayIcon.removeById(TRAY_ID).catch(() => {});

	const trayMenu = await Menu.new({
		items: [
			await MenuItem.new({
				id: 'toggle-recording',
				text: 'Toggle Recording',
				action: () => commandCallbacks.toggleManualRecording(),
			}),

			await PredefinedMenuItem.new({ item: 'Separator' }),

			await MenuItem.new({
				id: 'settings',
				text: 'Settings',
				action: async () => {
					await showMainWindow();
					// Navigate directly via the globally-exposed router (set in
					// AppLayout). The `navigate-main-window` event is emitted as a
					// fallback for any other window that may be listening.
					window.goto?.('/settings');
					await emit('navigate-main-window', { path: '/settings' });
				},
			}),

			await PredefinedMenuItem.new({ item: 'Separator' }),

			await MenuItem.new({
				id: 'quit',
				text: 'Quit',
				action: () => void exit(0),
			}),
		],
	});

	const tray = await TrayIcon.new({
		id: TRAY_ID,
		icon: await getIconPath('IDLE'),
		menu: trayMenu,
		menuOnLeftClick: false,
		action: async (e) => {
			// Left-click always brings the main window up. We don't toggle on
			// `isVisible()` because a minimized or mini-sized window still reports
			// visible, so toggling would hide it when the user expects it shown.
			if (
				e.type === 'Click' &&
				e.button === 'Left' &&
				e.buttonState === 'Down'
			) {
				await showMainWindow();
			}
		},
	});

	return tray;
}

async function getIconPath(recorderState: StenoRecordingState) {
	const iconPaths = {
		IDLE: 'recorder-state-icons/studio_microphone.png',
		RECORDING: 'recorder-state-icons/red_large_square.png',
	} as const satisfies Record<StenoRecordingState, string>;
	return await resolveResource(iconPaths[recorderState]);
}
