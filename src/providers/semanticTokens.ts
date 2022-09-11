import
{
	CancellationError,
	CancellationToken,
	DocumentSemanticTokensProvider,
	SemanticTokens,
	SemanticTokensBuilder,
	SemanticTokensLegend,
	TextDocument
} from 'vscode'
import
{
	SemanticTokenTypes,
	SemanticTokenModifiers,
	SemanticTokensParams,
	RequestType
} from 'vscode-languageclient'
import {ClientWorkspace} from '../client/extension'

const getSemanticTokensRequest: RequestType<SemanticTokensParams, GetSemanticTokensResult, void> =
	new RequestType<SemanticTokensParams, GetSemanticTokensResult, void>('mangrove/semanticTokens')

interface SemanticToken
{
	line: number
	character: number
	length: number
	type: number
	modifiers?: number
}

export interface GetSemanticTokensResult
{
	canceled: boolean
	tokens: SemanticToken[]
}

export class SemanticTokensProvider implements DocumentSemanticTokensProvider
{
	private workspace: ClientWorkspace
	private tokensLegend: SemanticTokensLegend

	constructor(workspace: ClientWorkspace)
	{
		this.workspace = workspace

		const tokenTypes: string[] = []
		for (const value in SemanticTokenTypes)
			tokenTypes.push(value)

		const tokenModifiers: string[] = []
		for (const value in SemanticTokenModifiers)
			tokenModifiers.push(value)

		this.tokensLegend = new SemanticTokensLegend(tokenTypes, tokenModifiers)
	}

	public get legend()
	{
		return this.tokensLegend
	}

	public async provideDocumentSemanticTokens(document: TextDocument, token: CancellationToken):
		Promise<SemanticTokens>
	{
		await this.workspace.awaitReady()
		const params: SemanticTokensParams =
		{
			textDocument: {uri: document.uri.toString()}
		}
		const result: GetSemanticTokensResult =
			await this.workspace.languageClient.sendRequest(getSemanticTokensRequest, params, token)

		if (result.canceled)
			throw new CancellationError()
		const builder: SemanticTokensBuilder = new SemanticTokensBuilder(this.tokensLegend)
		result.tokens.forEach(semanticToken =>
		{
			builder.push(
				semanticToken.length,
				semanticToken.character,
				semanticToken.length,
				semanticToken.type,
				semanticToken.modifiers
			)
		})
		const tokens: SemanticTokens = builder.build()
		return tokens
	}
}
