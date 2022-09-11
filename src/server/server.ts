import
{
	createConnection,
	DidChangeConfigurationNotification,
	InitializeParams,
	InitializeResult,
	ProposedFeatures
} from 'vscode-languageserver/node'

const connection = createConnection(ProposedFeatures.all)
let hasConfigurationCapability = false
let hasWorkspaceFolderCapability = false

connection.onInitialize((params: InitializeParams) =>
{
	const capabilities = params.capabilities
	hasConfigurationCapability = !!(capabilities.workspace && capabilities.workspace.configuration)
	hasWorkspaceFolderCapability = !!(capabilities.workspace && capabilities.workspace.workspaceFolders)

	const result: InitializeResult =
	{
		capabilities:
		{
			completionProvider: {resolveProvider: true}
		}
	}
	if (hasWorkspaceFolderCapability)
		result.capabilities.workspace = {workspaceFolders: {supported: true}}
	return result
})

connection.onInitialized(() =>
{
	if (hasConfigurationCapability)
		connection.client.register(DidChangeConfigurationNotification.type, undefined)
})

connection.listen()
