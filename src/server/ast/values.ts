import {SemanticToken, SemanticTokenTypes} from '../../providers/semanticTokens'
import {Token} from '../parser/types'
import {Symbol} from './symbolTable'
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
	private _symbol?: Symbol

	constructor(token: Token, symbol?: Symbol)
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
	private _symbolSeq: Symbol[] = new Array<Symbol>()

	constructor(token: Token, symbolSeq: Symbol[])
	{
		const symbol = symbolSeq.length ? symbolSeq[symbolSeq.length - 1] : undefined
		super(token, symbol)
		this._symbolSeq.push(...symbolSeq)
	}

	get type() { return ASTType.dottedIdent }
	toString() { return `<DottedIdent '${this.value}'>` }
}
