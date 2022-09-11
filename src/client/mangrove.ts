import {workspace, WorkspaceFolder} from 'vscode'
import * as path from 'path'
import * as langClient from 'vscode-languageclient'
import {
	DocumentSelector,
	LanguageClient,
	ServerOptions,
	TransportKind
} from 'vscode-languageclient/node'
import {extensionContext, WorkspaceProgress} from './extension'
import {Observable} from './utils/observable'

export const documentSelector: DocumentSelector = [
	{language: 'mangrove', scheme: 'file'},
	{language: 'mangrove', scheme: 'untitled'},
]

export async function createLanguageClient(folder: WorkspaceFolder): Promise<LanguageClient>
{
	const clientOptions: langClient.LanguageClientOptions =
	{
		documentSelector: documentSelector,
		diagnosticCollectionName: 'mangrove',
		initializationOptions: workspace.getConfiguration('mangrove'),
		workspaceFolder: folder
	}

	const languageServer = extensionContext.asAbsolutePath(path.join('build', 'server', 'server.js'))
	const serverOptions: ServerOptions =
	{
		run:
		{
			module: languageServer,
			transport: TransportKind.ipc
		},
		debug:
		{
			module: languageServer,
			transport: TransportKind.ipc,
			options: {execArgv: ['--nolazy', '--inspect=6009']}
		}
	}

	return new LanguageClient(
		'mangrove-client',
		'Mangrove Language Server',
		serverOptions,
		clientOptions
	)
}

interface ProgressParams
{
	id: string
	title?: string
	message?: string
	percentage?: number
	done?: boolean
}

export function setupProgress(client: langClient.CommonLanguageClient, workspaceProgress: Observable<WorkspaceProgress>)
{
	const runningProgress: Set<string> = new Set()

	client.onReady().then(() =>
		client.onNotification(
			new langClient.NotificationType<ProgressParams>('window/progress'),
			progress =>
			{
				if (progress.done)
					runningProgress.delete(progress.id)
				else
					runningProgress.add(progress.id)

				if (runningProgress.size)
				{
					const status = (() =>
					{
						if (typeof progress.percentage === 'number')
							return `${Math.round(progress.percentage * 100)}%`
						else if (progress.message)
							return progress.message
						else if (progress.title)
							return progress.title
						return ''
					})()
					workspaceProgress.value = {state: 'progress', message: status}
				}
				else
					workspaceProgress.value = {state: 'ready'}
			}
		)
	)
}
