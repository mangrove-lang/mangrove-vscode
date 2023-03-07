import
{
	createConnection,
	DidChangeConfigurationNotification,
	DocumentUri,
	InitializeParams,
	InitializeResult,
	ProposedFeatures,
	TextDocuments,
} from 'vscode-languageserver/node'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {getSemanticTokensRequest, handleSemanticTokensRequest} from './providers/semanticTokens'

const connection = createConnection(ProposedFeatures.all)
let hasConfigurationCapability = false
let hasWorkspaceFolderCapability = false

const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument)

connection.onInitialize((params: InitializeParams) =>
{
	const capabilities = params.capabilities
	hasConfigurationCapability = !!(capabilities.workspace && capabilities.workspace.configuration)
	hasWorkspaceFolderCapability = !!(capabilities.workspace && capabilities.workspace.workspaceFolders)

	const result: InitializeResult = {capabilities: {completionProvider: {resolveProvider: true}}}
	if (hasWorkspaceFolderCapability)
		result.capabilities.workspace = {workspaceFolders: {supported: true}}
	return result
})

connection.onInitialized(() =>
{
	if (hasConfigurationCapability)
		connection.client.register(DidChangeConfigurationNotification.type, undefined)
})

export function getDocumentFor(uri: DocumentUri)
{
	return documents.get(uri)
}

connection.onRequest(getSemanticTokensRequest, handleSemanticTokensRequest)

documents.listen(connection)
connection.listen()
