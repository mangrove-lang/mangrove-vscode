import {TextDocument} from 'vscode-languageserver-textdocument'
import {SemanticToken, SemanticTokenTypes} from '../../providers/semanticTokens'
import {Token} from '../parser/types'
import {MangroveSymbol} from './symbolTable'
import {ASTNode, ASTNodeData, ASTType} from './types'

export type ASTValue = ASTNode

export class ASTInvalid extends ASTNodeData implements ASTValue
{
	get type() { return ASTType.invalid }
	get valid() { return true }
	get semanticType() { return undefined }

	*semanticTokens(): Generator<SemanticToken, void, undefined>
	{
		for (const child of this.children)
			yield *child.semanticTokens()
	}
}

export class ASTIdent extends ASTNodeData implements ASTValue
{
	private _symbol?: MangroveSymbol

	constructor(token: Token, symbol?: MangroveSymbol)
	{
		super(token)
		this._symbol = symbol
	}

	get type() { return ASTType.ident }
	get valid() { return !!this._symbol && !!this._symbol.value }
	get semanticType() { return SemanticTokenTypes.variable }
	get value() { return this._symbol && this._symbol.value }
	get symbol() { return this._symbol }
	toString() { return `<Ident '${this.value}'>` }

	*semanticTokens(): Generator<SemanticToken, void, undefined>
	{
		yield this.buildSemanticToken(this.semanticType)
		for (const child of this.children)
			yield *child.semanticTokens()
	}
}

export class ASTDottedIdent extends ASTIdent
{
	private _symbolSeq: MangroveSymbol[] = new Array<MangroveSymbol>()

	constructor(token: Token, symbolSeq: MangroveSymbol[])
	{
		const symbol = symbolSeq.length ? symbolSeq[symbolSeq.length - 1] : undefined
		super(token, symbol)
		this._symbolSeq.push(...symbolSeq)
	}

	get type() { return ASTType.dottedIdent }
	toString() { return `<DottedIdent '${this.value}'>` }
}

export class ASTCallArguments extends ASTNodeData implements ASTNode
{
	private _arguments: ASTNode[] = []

	get type() { return ASTType.callArguments }
	get valid() { return this._arguments.every(arg => arg.valid) }
	get semanticType() { return undefined }
	get empty() { return this._arguments.length == 0 }
	get arguments() { return this._arguments }
	toString() { return `<CallArguments: ${this.arguments.length} parameters>` }

	*semanticTokens(): Generator<SemanticToken, void, undefined>
	{
		for (const child of this.children)
			yield *child.semanticTokens()
	}

	addArgument(argument: ASTNode)
	{
		this.add([argument])
		this._arguments.push(argument)
	}

	adjustEnd(token: Token, file: TextDocument)
	{
		this._token.endsAt(token.location.end)
		this._token.calcLength(file)
	}
}
