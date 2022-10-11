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

export class ASTBetween extends ASTNodeData implements ASTNode
{
	private _lhs: ASTNode
	private _lop: Token
	private _value: ASTNode
	private _rop: Token
	private _rhs: ASTNode

	constructor(relation: ASTRel, rop : Token, rhs: ASTNode)
	{
		super(relation.rhs.token)
		this._lhs = relation.lhs
		this._lop = relation.token
		this._value = relation.rhs
		// The parent constructor clones the provided Token, undo that here
		this._token = this._value.token
		this._rop = rop
		this._rhs = rhs
	}

	get type() { return ASTType.between }
	get valid() { return this._lhs.valid && this._value.valid && this._rhs.valid }
	get semanticType() { return SemanticTokenTypes.operator }
	toString() { return `<Between op: '${this._lop.value} ${this.token.value} ${this._rop.value}'>` }

	*semanticTokens(): Generator<SemanticToken, void, undefined>
	{
		yield *this._lhs.semanticTokens()
		yield this.buildSemanticToken(this.semanticType, this._lop)
		yield *this._value.semanticTokens()
		yield this.buildSemanticToken(this.semanticType, this._rop)
		yield *this._rhs.semanticTokens()
		for (const child of this.children)
			yield *child.semanticTokens()
	}
}

export class ASTLogic extends ASTNodeData implements ASTNode
{
	private _lhs: ASTNode
	private _rhs: ASTNode

	constructor(op : Token, lhs: ASTNode, rhs: ASTNode)
	{
		super(op)
		this._lhs = lhs
		this._rhs = rhs
	}

	get type() { return ASTType.logic }
	get valid() { return this._lhs.valid && this.token.valid && this._rhs.valid }
	get semanticType() { return SemanticTokenTypes.operator }
	toString() { return `<Logic op: '${this.token.value}'>` }

	*semanticTokens(): Generator<SemanticToken, void, undefined>
	{
		yield *this._lhs.semanticTokens()
		yield this.buildSemanticToken(this.semanticType)
		yield *this._rhs.semanticTokens()
		for (const child of this.children)
			yield *child.semanticTokens()
	}
}
