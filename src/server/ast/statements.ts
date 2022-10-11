import {SemanticToken, SemanticTokenTypes} from '../../providers/semanticTokens'
import {Token} from '../parser/types'
import {ASTNode, ASTNodeData, ASTType} from './types'

export class ASTIfExpr extends ASTNodeData implements ASTNode
{
	private _cond: ASTNode
	private _trueBlock: ASTNode

	constructor(ifToken: Token, cond: ASTNode, trueBlock: ASTNode)
	{
		super(ifToken)
		this._cond = cond
		this._trueBlock = trueBlock
	}

	get type() { return ASTType.ifExpr }
	get valid() { return this.token.valid && this._cond.valid && this._trueBlock.valid }
	get semanticType() { return SemanticTokenTypes.keyword }
	toString() { return '<If expression>' }

	*semanticTokens(): Generator<SemanticToken, void, undefined>
	{
		yield this.buildSemanticToken(this.semanticType)
		yield *this._cond.semanticTokens()
		yield *this._trueBlock.semanticTokens()
		for (const child of this.children)
			yield *child.semanticTokens()
	}
}

export class ASTElifExpr extends ASTNodeData implements ASTNode
{
	private _cond: ASTNode
	private _trueBlock: ASTNode

	constructor(elifToken: Token, cond: ASTNode, trueBlock: ASTNode)
	{
		super(elifToken)
		this._cond = cond
		this._trueBlock = trueBlock
	}

	get type() { return ASTType.elifExpr }
	get valid() { return this.token.valid && this._cond.valid && this._trueBlock.valid }
	get semanticType() { return SemanticTokenTypes.keyword }
	toString() { return '<Elif expression>' }

	*semanticTokens(): Generator<SemanticToken, void, undefined>
	{
		yield this.buildSemanticToken(this.semanticType)
		yield *this._cond.semanticTokens()
		yield *this._trueBlock.semanticTokens()
		for (const child of this.children)
			yield *child.semanticTokens()
	}
}
