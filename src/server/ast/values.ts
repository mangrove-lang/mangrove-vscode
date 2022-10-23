//import {assert} from 'console'
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
	//get value() { return this._symbol && this._symbol.value }
	get value() { return this.token.value }
	get symbol() { return this._symbol }
	get fullName() { return this.token.value }
	toString() { return `<Ident '${this.fullName}'>` }

	*semanticTokens(): Generator<SemanticToken, void, undefined>
	{
		yield this.buildSemanticToken(this.semanticType)
		for (const child of this.children)
			yield *child.semanticTokens()
	}
}

export class ASTDottedIdent extends ASTIdent
{
	private _idents: Token[]
	private _symbolSeq: MangroveSymbol[] = []

	constructor(identTokens: Token[], symbolSeq: MangroveSymbol[])
	{
		//assert(identTokens.length != symbolSeq.length, "Must have one symbol entry per ident in dotted ident")
		const token = identTokens[identTokens.length - 1]
		const symbol = symbolSeq.length ? symbolSeq[symbolSeq.length - 1] : undefined

		super(token, symbol)
		this._idents = identTokens
		this._symbolSeq.push(...symbolSeq)
	}

	get type() { return ASTType.dottedIdent }
	get fullName() { return this._idents.map(ident => ident.value).join('.') }
	toString() { return `<DottedIdent '${this.fullName}'>` }

	*semanticTokens(): Generator<SemanticToken, void, undefined>
	{
		for (const ident of this._idents)
			yield this.buildSemanticToken(this.semanticType, ident)
		for (const child of this.children)
			yield *child.semanticTokens()
	}
}

export class ASTIndex extends ASTNodeData implements ASTNode
{
	private _target: ASTIdent
	private _index: ASTNode

	constructor(target: ASTIdent)
	{
		super(target.token)
		this._target = target
		// This temporarily creates a fake invalid token which we swiftly override in parseIndex()
		this._index = new ASTInvalid(new Token())
	}

	get type() { return ASTType.index }
	get valid() { return this.target.valid && this.index.valid }
	get semanticType() { return undefined }
	get target() { return this._target }
	get index() { return this._index }
	set index(index: ASTNode) { this._index = index }
	toString() { return `<Index into: '${this.target.value}>` }

	*semanticTokens(): Generator<SemanticToken, void, undefined>
	{
		yield *this.target.semanticTokens()
		yield *this.index.semanticTokens()
		for (const child of this.children)
			yield *child.semanticTokens()
	}
}

export class ASTSlice extends ASTNodeData implements ASTNode
{
	private _target: ASTIdent
	private _begin?: ASTNode
	private _end?: ASTNode

	constructor(target: ASTIdent, begin?: ASTNode)
	{
		super(target.token)
		this._target = target
		this._begin = begin
	}

	get type() { return ASTType.slice }
	get valid() { return this.target.valid }
	get semanticType() { return undefined }
	get target() { return this._target }
	get begin() { return this._begin }
	get end() { return this._end }
	set end(index: ASTNode | undefined) { this._end = index }
	toString() { return `<Slice of: '${this._target.value}>` }

	*semanticTokens(): Generator<SemanticToken, void, undefined>
	{
		yield *this.target.semanticTokens()
		if (this.begin)
			yield *this.begin.semanticTokens()
		for (const child of this.children)
			yield *child.semanticTokens()
	}
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
