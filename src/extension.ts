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
} from "vscode"
import * as langClient from "vscode-languageclient"
import {Observable} from "./utils/observable"

export interface Api
{
	activeWorkspace : typeof activeWorkspace
}

export async function activate(context: ExtensionContext) : Promise<Api>
{
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

export class ClientWorkspace
{
	public readonly folder: WorkspaceFolder
	private languageClient: langClient.CommonLanguageClient | null = null
	private disposables: Disposable[]

	constructor(folder: WorkspaceFolder)
	{
		this.folder = folder
		this.disposables = []
	}

	public async autoStart()
	{
		return this.start().then(() => true)
	}

	public async start()
	{
		//const client = await createLanguageClient
	}

	public async stop()
	{
		if (this.languageClient)
			await this.languageClient.stop()
		this.disposables.forEach(item => void item.dispose())
	}

	public async restart()
	{
		await this.stop()
		return this.start()
	}
}

function activeTextEditorChanged(editor: TextEditor | undefined)
{
	if (!editor || !editor.document)
		return
	const {languageId, uri} = editor.document
	const workspace = clientWorkspaceForURI(uri, {initialiseIfMissing: languageId === "mangrove"})
	if (!workspace)
		return
	activeWorkspace.value = workspace
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
		workspace.autoStart()
	}
	return workspaces.get(folder.uri.toString())
}

function registerCommands(): Disposable[]
{
	return [
		commands.registerCommand("mangrove.restart",
			async () => activeWorkspace.value?.restart()
		),
	]
}

function configureLanguage(): Disposable
{
	return languages.setLanguageConfiguration("mangrove", {})
}
