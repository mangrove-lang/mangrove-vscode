import {SemanticToken, SemanticTokenTypes} from '../../providers/semanticTokens'
import {Token} from '../parser/types'
import {ASTIntType, ASTNodeData, ASTType} from './types'
import {ASTValue} from './values'

export class ASTInt extends ASTNodeData implements ASTValue
{
	private _type: ASTIntType

	constructor(type: ASTIntType, token: Token)
	{
		super(token)
		this._type = type
	}

	get type() { return ASTType.intValue }
	get valid() { return this.token.valid }
	get semanticType() { return SemanticTokenTypes.number }
	toString() { return `<Int (${this._type}): ${this.token.value}>` }

	*semanticTokens(): Generator<SemanticToken, void, undefined>
	{
		yield this.buildSemanticToken(this.semanticType)
		for (const child of this.children)
			yield *child.semanticTokens()
	}
}

export class ASTFloat extends ASTNodeData implements ASTValue
{
	private floatBits: number

	constructor(floatBits: number, token: Token)
	{
		super(token)
		this.floatBits = floatBits
	}

	get type() { return ASTType.floatValue }
	get valid() { return this.token.valid }
	get semanticType() { return SemanticTokenTypes.number }
	toString() { return `<Float${this.floatBits}: ${this.token.value}>` }

	*semanticTokens(): Generator<SemanticToken, void, undefined>
	{
		yield this.buildSemanticToken(this.semanticType)
		for (const child of this.children)
			yield *child.semanticTokens()
	}
}

export class ASTStringLit extends ASTNodeData implements ASTValue
{
	private segments: Token[] = new Array<Token>()

	constructor(token: Token)
	{
		super(token)
		this.segments.push(this.token)
	}

	get type() { return ASTType.stringLitValue }
	get valid() { return this.token.valid }
	get semanticType() { return SemanticTokenTypes.string }

	toString()
	{
		let value = ''
		for (const segment of this.segments)
			value += segment.value
		return `<String: '${value}'>`
	}

	*semanticTokens(): Generator<SemanticToken, void, undefined>
	{
		for (const segment of this.segments)
			yield this.buildSemanticToken(this.semanticType, segment)
		for (const child of this.children)
			yield *child.semanticTokens()
	}

	*yieldTokens(): Generator<Token, void, undefined> // XXX: Needs removing when the parser is converted.
	{
		for (const segment of this.segments)
			yield segment
		for (const child of this.children)
			yield *child.yieldTokens()
	}

	addSegment(token: Token)
	{
		if (!this.token.isEqual(token))
			this.segments.push(token.clone())
	}
}

export class ASTCharLit extends ASTNodeData implements ASTValue
{
	get type() { return ASTType.charLitValue }
	get valid() { return this.token.valid }
	get semanticType() { return SemanticTokenTypes.string }
	toString() { return `<Character: '${this.token.value}'>` }

	*semanticTokens(): Generator<SemanticToken, void, undefined>
	{
		yield this.buildSemanticToken(this.semanticType)
		for (const child of this.children)
			yield *child.semanticTokens()
	}
}

export class ASTBool extends ASTNodeData implements ASTValue
{
	private value: boolean

	constructor(token: Token)
	{
		super(token)
		this.value = token.value === 'true'
	}

	get type() { return ASTType.boolValue }
	get valid() { return this.token.valid }
	get semanticType() { return SemanticTokenTypes.const }
	toString() { return `<Bool: ${this.value}>` }

	*semanticTokens(): Generator<SemanticToken, void, undefined>
	{
		yield this.buildSemanticToken(this.semanticType)
		for (const child of this.children)
			yield *child.semanticTokens()
	}
}

export class ASTNull extends ASTNodeData implements ASTValue
{
	get type() { return ASTType.nullValue }
	get valid() { return this.token.valid }
	get semanticType() { return SemanticTokenTypes.const }
	toString() { return '<Null>' }

	*semanticTokens(): Generator<SemanticToken, void, undefined>
	{
		yield this.buildSemanticToken(this.semanticType)
		for (const child of this.children)
			yield *child.semanticTokens()
	}
}
