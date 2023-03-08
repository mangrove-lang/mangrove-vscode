import {
	SemanticTokensParams,
	RequestType,
	CancellationToken,
} from 'vscode-languageserver'
import {GetSemanticTokensResult} from '../../providers/semanticTokens'
import {tokenise} from '../parser/mangrove'
import {getDocumentFor} from '../server'

export const getSemanticTokensRequest =
	new RequestType<SemanticTokensParams, GetSemanticTokensResult, void>('mangrove/semanticTokens')

export function handleSemanticTokensRequest(params: SemanticTokensParams, token: CancellationToken):
	GetSemanticTokensResult
{
	const file = getDocumentFor(params.textDocument.uri)
	if (!file)
		return {
			canceled: true,
			tokens: [],
			diagnostics: [],
		}

	const {tokens, errors} = tokenise(file)
	const diagnostics = errors.map(err => err.toDiagnostic())
	const result: GetSemanticTokensResult =
	{
		canceled: token.isCancellationRequested,
		tokens,
		diagnostics,
	}
	return result
}
