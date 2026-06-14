import { Menu, MenuItem, PredefinedMenuItem } from '@tauri-apps/api/menu';
import { resolveResource } from '@tauri-apps/api/path';
import { TrayIcon } from '@tauri-apps/api/tray';
import { getCurrentWindow } from '@tauri-apps/api/window';
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

async function showMainWindow() {
	const appWindow = getCurrentWindow();
	await appWindow.show();
	await appWindow.setFocus();
}

async function initTray() {
	const existingTray = await TrayIcon.getById(TRAY_ID);
	if (existingTray) return existingTray;

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
			if (
				e.type === 'Click' &&
				e.button === 'Left' &&
				e.buttonState === 'Down'
			) {
				const appWindow = getCurrentWindow();
				const isVisible = await appWindow.isVisible();
				if (isVisible) {
					await appWindow.hide();
				} else {
					await appWindow.show();
					await appWindow.setFocus();
				}
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
