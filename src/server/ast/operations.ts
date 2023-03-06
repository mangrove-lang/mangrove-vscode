import {SemanticToken, SemanticTokenTypes} from '../../providers/semanticTokens'
import {Token} from '../parser/types'
import {ASTNode, ASTNodeData, ASTType} from './types'
import {ASTIdent, ASTCallArguments, ASTTemplateArguments} from './values'

export class ASTFunctionCall extends ASTNodeData implements ASTNode
{
	private _functionName: ASTIdent
	private _args: ASTCallArguments
	private _templateArgs?: ASTTemplateArguments

	constructor(func: ASTIdent, args: ASTCallArguments)
	{
		super(func.token)
		this._token = func.token
		this._functionName = func
		this._args = args
	}

	get type() { return ASTType.functionCall }
	get valid() { return this._functionName.valid && this._args.valid && (this._templateArgs?.valid ?? true) }
	get semanticType() { return SemanticTokenTypes.function }
	get functionName() { return this._functionName.fullName }
	toString() { return `<FunctionCall: '${this.functionName}'>` }
	addTemplateArgs(args: ASTTemplateArguments) { this._templateArgs = args }

	*semanticTokens(): Generator<SemanticToken, void, undefined>
	{
		yield this.buildSemanticToken(this.semanticType)
		if (this._templateArgs)
			yield* this._templateArgs.semanticTokens()
		yield* this._args.semanticTokens()
	}
}

class ASTUnaryOp extends ASTNodeData implements ASTNode
{
	private _value: ASTNode

	constructor(op: Token, value: ASTNode)
	{
		super(op)
		this._value = value
	}

	get type(): ASTType { throw Error('Derived types must implement type()') }
	get valid() { return this.token.valid && this.value.valid }
	get semanticType() { return SemanticTokenTypes.operator }
	get op() { return this.token.value }
	get value() { return this._value }
	get operationName(): string { throw Error('Derived types must implement operationName()') }
	toString() { return `<${this.operationName} op: '${this.token.value}'>` }

	*semanticTokens(): Generator<SemanticToken, void, undefined>
	{
		yield this.buildSemanticToken(this.semanticType)
		yield* this.value.semanticTokens()
		for (const child of this.comments)
			yield* child.semanticTokens()
	}
}

class ASTBinaryOp extends ASTNodeData implements ASTNode
{
	private _lhs: ASTNode
	private _rhs: ASTNode

	constructor(lhs: ASTNode, op: Token, rhs: ASTNode)
	{
		super(op)
		this._lhs = lhs
		this._rhs = rhs
	}

	get type(): ASTType { throw Error('Derived types must implement type()') }
	get valid() { return this.lhs.valid && this.token.valid && this.rhs.valid }
	get semanticType() { return SemanticTokenTypes.operator }
	get lhs() { return this._lhs }
	get op() { return this.token.value }
	get rhs() { return this._rhs }
	get operationName(): string { throw Error('Derived types must implement operationName()') }
	toString() { return `<${this.operationName} op: '${this.token.value}'>` }

	*semanticTokens(): Generator<SemanticToken, void, undefined>
	{
		yield* this.lhs.semanticTokens()
		yield this.buildSemanticToken(this.semanticType)
		yield* this.rhs.semanticTokens()
		for (const child of this.comments)
			yield* child.semanticTokens()
	}
}

export class ASTPrefixOp extends ASTUnaryOp
{
	get type() { return ASTType.deref }

	get operationName()
	{
		const operation = this.token.value === '+' ? 'increment' : 'decrement'
		return `Prefix ${operation}`
	}
}

export class ASTPostfixOp extends ASTUnaryOp
{
	get type() { return ASTType.deref }

	get operationName()
	{
		const operation = this.token.value === '+' ? 'increment' : 'decrement'
		return `Postfix ${operation}`
	}
}

export class ASTDeref extends ASTUnaryOp
{
	get type() { return ASTType.deref }
	get operationName() { return 'Dereference' }
}

export class ASTInvert extends ASTUnaryOp
{
	get type() { return ASTType.invert }
	get operationName() { return 'Inversion' }
}

export class ASTMul extends ASTBinaryOp
{
	get type() { return ASTType.mul }
	get operationName() { return 'Multiplication' }
}

export class ASTAdd extends ASTBinaryOp
{
	get type() { return ASTType.add }
	get operationName() { return 'Addition' }
}

export class ASTShift extends ASTBinaryOp
{
	get type() { return ASTType.shift }
	get operationName() { return 'Bit-shift' }
}

export class ASTBit extends ASTBinaryOp
{
	get type() { return ASTType.bit }
	get operationName() { return 'Bitwise' }
}

export class ASTRel extends ASTBinaryOp
{
	get type() { return ASTType.rel }
	get operationName() { return 'Relation' }
}

export class ASTBetween extends ASTNodeData implements ASTNode
{
	private _lhs: ASTNode
	private _lop: Token
	private _value: ASTNode
	private _rop: Token
	private _rhs: ASTNode

	constructor(relation: ASTRel, rop: Token, rhs: ASTNode)
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
		yield* this._lhs.semanticTokens()
		yield this.buildSemanticToken(this.semanticType, this._lop)
		yield* this._value.semanticTokens()
		yield this.buildSemanticToken(this.semanticType, this._rop)
		yield* this._rhs.semanticTokens()
		for (const child of this.comments)
			yield* child.semanticTokens()
	}
}

export class ASTLogic extends ASTBinaryOp
{
	get type() { return ASTType.logic }
	get operationName() { return 'Logic' }
}

export class ASTAssign extends ASTNodeData implements ASTNode
{
	private _ident: ASTIdent
	private _value: ASTNode

	constructor(assignOp: Token, ident: ASTIdent, value: ASTNode)
	{
		super(assignOp)
		this._ident = ident
		this._value = value
	}

	get type() { return ASTType.assign }
	get valid() { return this._token.valid && this.ident.valid && this._value.valid }
	get semanticType() { return SemanticTokenTypes.operator }
	get ident() { return this._ident }
	toString() { return `<Assignment ${this.token.value} op: '${this.ident.fullName}>` }

	*semanticTokens(): Generator<SemanticToken, void, undefined>
	{
		yield* this._ident.semanticTokens()
		yield this.buildSemanticToken(this.semanticType)
		yield* this._value.semanticTokens()
		for (const child of this.comments)
			yield* child.semanticTokens()
	}
}
