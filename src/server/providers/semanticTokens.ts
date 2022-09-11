import {
	SemanticTokensParams,
	RequestType,
	HandlerResult,
	CancellationToken
} from 'vscode-languageserver'
import {GetSemanticTokensResult} from '../../providers/semanticTokens'
//import {parse} from '../parser/mangrove'
import { getDocumentFor } from '../server'

export const getSemanticTokensRequest: RequestType<SemanticTokensParams, GetSemanticTokensResult, void> =
	new RequestType<SemanticTokensParams, GetSemanticTokensResult, void>('mangrove/semanticTokens')

export function handleSemanticTokensRequest(params: SemanticTokensParams, token: CancellationToken):
	HandlerResult<GetSemanticTokensResult, void>
{
	const file = getDocumentFor(params.textDocument.uri)
	const result: GetSemanticTokensResult =
	{
		canceled: token.isCancellationRequested,
		tokens: []
	}

	//result.tokens.push()

	return result
}
