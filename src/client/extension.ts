import
{
	commands,
	Disposable,
	ExtensionContext,
	languages,
	TextEditor,
	Uri,
	window,
	workspace,
	WorkspaceFolder,
	WorkspaceFoldersChangeEvent
} from 'vscode'
import * as langClient from 'vscode-languageclient'
import {LanguageClient} from 'vscode-languageclient/node'
import {createLanguageClient, setupClient, setupProgress} from './mangrove'
import {Observable} from './utils/observable'
import {startSpinner, stopSpinner} from './utils/spinner'

export interface Api
{
	activeWorkspace : typeof activeWorkspace
}

export async function activate(context: ExtensionContext) : Promise<Api>
{
	extensionContext = context
	context.subscriptions.push(
		...[
			configureLanguage(),
			...registerCommands(),
			workspace.onDidChangeWorkspaceFolders(workspaceFoldersChanged),
			window.onDidChangeActiveTextEditor(activeTextEditorChanged),
		],
	)
	activeTextEditorChanged(window.activeTextEditor)

	return {activeWorkspace}
}

export async function deactivate()
{
	return Promise.all([...workspaces.values()].map(workspace => workspace.stop()))
}

const workspaces: Map<string, ClientWorkspace> = new Map()
const activeWorkspace = new Observable<ClientWorkspace | null>(null)
export let extensionContext: ExtensionContext
let progress: Disposable | undefined

export type WorkspaceProgress = {state: 'progress'; message: string} | {state: 'ready' | 'standby'}

export class ClientWorkspace
{
	public readonly folder: WorkspaceFolder
	private client: LanguageClient | null = null
	private clientStarted: Thenable<void>
	private disposables: Disposable[]
	private _progress: Observable<WorkspaceProgress>

	get progress()
	{
		return this._progress
	}

	get languageClient()
	{
		if (!this.client)
			throw new Error('Attempting to use languageClient before it is initialised')
		return this.client
	}

	constructor(folder: WorkspaceFolder)
	{
		this.folder = folder
		this.disposables = []
		this._progress = new Observable<WorkspaceProgress>({state: 'standby'})
		this.clientStarted = this.start()
	}

	public async start()
	{
		const client = await createLanguageClient(this.folder)
		client.onDidChangeState(({newState}) => {
			if (newState === langClient.State.Starting)
				this._progress.value = {state: 'progress', message: 'Starting'}
			else if (newState === langClient.State.Stopped)
				this._progress.value = {state: 'standby'}
		})

		this.client = client
		setupProgress(client, this._progress)
		//this.disposables.push(activateTaskProvder(this.folder))
		this.disposables.push(...setupClient(client, this.folder))
		if (client.needsStart())
			this.disposables.push(client.start())
	}

	public async stop()
	{
		if (this.client)
			await this.client.stop()
		this.disposables.forEach(item => void item.dispose())
	}

	public async restart()
	{
		await this.stop()
		return this.start()
	}

	public awaitReady()
	{
		return this.clientStarted
	}
}

function activeTextEditorChanged(editor: TextEditor | undefined)
{
	if (!editor || !editor.document)
		return
	const {languageId, uri} = editor.document
	const workspace = clientWorkspaceForURI(uri, {initialiseIfMissing: languageId === 'mangrove'})
	if (!workspace)
		return
	activeWorkspace.value = workspace

	const updateProgress = (progress: WorkspaceProgress) =>
	{
		if (progress.state === 'progress')
			startSpinner(`[${workspace.folder.name}] ${progress.message}`)
		else
		{
			const symbol = progress.state === 'standby' ? '$(debug-stop)': '$(debug-start)'
			stopSpinner(`[${workspace.folder.name}] ${symbol}`)
		}
	}

	if (progress)
		progress.dispose()
	progress = workspace.progress.observe(updateProgress)
	updateProgress(workspace.progress.value)
}

function workspaceFoldersChanged(event: WorkspaceFoldersChangeEvent)
{
	for (const folder of event.removed)
	{
		const workspace = workspaces.get(folder.uri.toString())
		if (workspace)
		{
			workspaces.delete(folder.uri.toString())
			workspace.stop()
		}
	}
}

function clientWorkspaceForURI(uri: Uri, options?: {initialiseIfMissing: boolean}): ClientWorkspace | undefined
{
	const folder = workspace.getWorkspaceFolder(uri)
	if (!folder)
		return undefined

	const alreadyExists = workspaces.get(folder.uri.toString())
	if (!alreadyExists && options && options.initialiseIfMissing)
	{
		const workspace = new ClientWorkspace(folder)
		workspaces.set(folder.uri.toString(), workspace)
	}
	return workspaces.get(folder.uri.toString())
}

function registerCommands(): Disposable[]
{
	return [
		commands.registerCommand('mangrove.restart',
			async () => activeWorkspace.value?.restart()
		),
	]
}

function configureLanguage(): Disposable
{
	return languages.setLanguageConfiguration('mangrove', {})
}
