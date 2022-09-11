import {Disposable, workspace, WorkspaceFolder} from 'vscode'
import * as langClient from 'vscode-languageclient'
import {LanguageClient, ServerOptions, TransportKind} from 'vscode-languageclient/node'
import {WorkspaceProgress} from './extension'
import {Observable} from './utils/observable'

const progress: Observable<WorkspaceProgress> = new Observable<WorkspaceProgress>({state: 'standby'})

export async function createLanguageClient(languageServer: string, folder: WorkspaceFolder): Promise<langClient.CommonLanguageClient>
{
	const clientOptions: langClient.LanguageClientOptions =
	{
		documentSelector: [
			{language: 'mangrove', scheme: 'file'},
			{language: 'mangrove', scheme: 'untitled'},
		],
		diagnosticCollectionName: 'mangrove',
		initializationOptions: workspace.getConfiguration('mangrove'),
		workspaceFolder: folder
	}

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

	const instance = new LanguageClient(
		'mangrove-client',
		'Mangrove Language Server',
		serverOptions,
		clientOptions
	)
	instance.registerProposedFeatures()

	return instance
}

export function setupClient(_client: langClient.CommonLanguageClient, _folder: WorkspaceFolder): Disposable[]
{
	return []
}

export function setupProgress(_client: langClient.CommonLanguageClient, workspaceProgress: Observable<WorkspaceProgress>)
{
	workspaceProgress.value = progress.value
	progress.observe(progress => {workspaceProgress.value = progress})
}
