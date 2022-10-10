import {SemanticToken, SemanticTokenTypes} from '../../providers/semanticTokens'
import {Token} from '../parser/types'
import {ASTNode, ASTNodeData, ASTType} from './types'

export class ASTRel extends ASTNodeData implements ASTNode
{
	private _lhs: ASTNode
	private _rhs: ASTNode

	constructor(lhs: ASTNode, op: Token, rhs: ASTNode)
	{
		super(op)
		this._lhs = lhs
		this._rhs = rhs
	}

	get type() { return ASTType.rel }
	get valid() { return this.lhs.valid && this.token.valid && this.rhs.valid }
	get semanticType() { return SemanticTokenTypes.operator }
	get lhs() { return this._lhs }
	get op() { return this.token.value }
	get rhs() { return this._rhs }
	toString() { return `<Relation op: '${this.token.value}'>` }

	*semanticTokens(): Generator<SemanticToken, void, undefined>
	{
		yield *this._lhs.semanticTokens()
		yield this.buildSemanticToken(this.semanticType)
		yield *this._rhs.semanticTokens()
		for (const child of this.children)
			yield *child.semanticTokens()
	}
}
