//import {assert} from 'console'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {SemanticToken, SemanticTokenTypes} from '../../providers/semanticTokens'
import {Token} from '../parser/types'
import {MangroveSymbol, SymbolTypes} from './symbolTable'
import {ASTNode, ASTNodeData, ASTType} from './types'

export type ASTValue = ASTNode

export class ASTInvalid extends ASTNodeData implements ASTValue
{
	get type() { return ASTType.invalid }
	get valid() { return true }
	get semanticType() { return undefined }

	*semanticTokens(): Generator<SemanticToken, void, undefined>
	{
		for (const child of this.comments)
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

	get isType() { return this.symbol?.isType ?? false }

	get type() { return ASTType.ident }
	get valid() { return !!this._symbol && !!this._symbol.value }
	get semanticType() { return this.symbolSemanticType(this.symbol) }
	//get value() { return this._symbol && this._symbol.value }
	get value() { return this.token.value }
	get fullName() { return this.token.value }
	toString() { return `<Ident '${this.fullName}'>` }

	*semanticTokens(): Generator<SemanticToken, void, undefined>
	{
		yield this.buildSemanticToken(this.semanticType)
		for (const child of this.comments)
			yield *child.semanticTokens()
	}

	get symbol() { return this._symbol }
	set symbol(symbol: MangroveSymbol | undefined)
	{
		if (!symbol)
			return
		// NOTE: To go over with Freyja on 2022-12-10
		if (this._symbol)
			console.info(`Ident ${this.fullName} shadows existing identifier`)
		this._symbol = symbol
	}

	protected symbolSemanticType(symbol?: MangroveSymbol)
	{
		if (symbol?.isType)
		{
			const type = symbol.type.without(SymbolTypes.pack)
			if (type === SymbolTypes.type || type === SymbolTypes.auto)
				return SemanticTokenTypes.keyword
			return SemanticTokenTypes.type
		}
		return SemanticTokenTypes.variable
	}
}

export class ASTDottedIdent extends ASTIdent
{
	private _idents: Token[]
	private _symbolSeq: (MangroveSymbol | undefined)[] = []

	constructor(identTokens: Token[], symbolSeq: (MangroveSymbol | undefined)[])
	{
		//assert(identTokens.length !== symbolSeq.length, "Must have one symbol entry per ident in dotted ident")
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
		for (const [i, ident] of this._idents.entries())
		{
			const symbol = this._symbolSeq[i]
			const semanticType = this.symbolSemanticType(symbol)
			yield this.buildSemanticToken(semanticType, ident)
		}
		for (const child of this.comments)
			yield *child.semanticTokens()
	}
}

export class ASTStorage extends ASTNodeData implements ASTNode
{
	private _static?: Token
	private _const?: Token
	private _volatile?: Token

	constructor(constToken?: Token, volatileToken?: Token)
	{
		// Dummy token to make the constructor happy. `this._token` is intentionally unused in this type
		super(new Token())
		this._const = constToken
		this._volatile = volatileToken
	}

	get type() { return ASTType.storageSpec }
	// Need to test each of the 3 tokens and if a given one is not `undefined`, test its validity
	get valid() { return true }
	get semanticType() { return SemanticTokenTypes.keyword }
	get staticSpec() { return this._static }
	set staticSpec(token: Token | undefined) { this._static = token }
	get constSpec() { return this._const }
	get volatileSpec() { return this._volatile }
	set volatileSpec(token: Token | undefined) { this._volatile = token }

	get specification()
	{
		const specs = [this.staticSpec?.value, this.constSpec?.value, this.volatileSpec?.value]
		return specs.filter(str => !!str).join(' ')
	}

	toString() { return `<Storage spec: ${this.specification}>` }

	*semanticTokens(): Generator<SemanticToken, void, undefined>
	{
		if (this._static)
			yield this.buildSemanticToken(this.semanticType, this._static)
		if (this._const)
			yield this.buildSemanticToken(this.semanticType, this._const)
		if (this._volatile)
			yield this.buildSemanticToken(this.semanticType, this._volatile)
	}
}

export class ASTTypeDecl extends ASTIdent
{
	private _storageSpec?: ASTStorage

	constructor(type: ASTIdent, storageSpec?: ASTStorage)
	{
		super(type.token, type.symbol)
		this.add(type.comments)
		this._storageSpec = storageSpec
	}

	get storageSpec() { return this._storageSpec }

	toString()
	{
		const storage = this._storageSpec?.specification ?? ''
		return `<TypeDecl '${storage} ${this.token.value}'>`
	}

	*semanticTokens(): Generator<SemanticToken, void, undefined>
	{
		if (this.storageSpec)
			yield *this.storageSpec.semanticTokens()
		yield this.buildSemanticToken(this.semanticType)
		for (const child of this.comments)
			yield *child.semanticTokens()
	}
}

export class ASTIdentDef extends ASTIdent
{
	private _type: ASTIdent

	constructor(type: ASTIdent, ident: ASTIdent)
	{
		super(ident.token, ident.symbol)
		this.add(ident.comments)
		this._type = type
	}

	get identType() { return this._type }
	toString() { return `<IdentDef '${this.identType.fullName} ${this.fullName}'>` }

	*semanticTokens(): Generator<SemanticToken, void, undefined>
	{
		yield *this.identType.semanticTokens()
		yield this.buildSemanticToken(this.semanticType)
		for (const child of this.comments)
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
		for (const child of this.comments)
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
		for (const child of this.comments)
			yield *child.semanticTokens()
	}
}

export class ASTCallArguments extends ASTNodeData implements ASTNode
{
	private _arguments: ASTNode[] = []

	get type() { return ASTType.callArguments }
	get valid() { return this.arguments.every(arg => arg.valid) }
	get semanticType() { return undefined }
	get empty() { return this.arguments.length === 0 }
	get arguments() { return this._arguments }
	toString() { return `<CallArguments: ${this.arguments.length} parameters>` }

	addArgument(argument: ASTNode) { this.arguments.push(argument) }

	*semanticTokens(): Generator<SemanticToken, void, undefined>
	{
		for (const argument of this.arguments)
			yield *argument.semanticTokens()
		for (const child of this.comments)
			yield *child.semanticTokens()
	}

	adjustEnd(token: Token, file: TextDocument)
	{
		this._token.endsAt(token.location.end)
		this._token.calcLength(file)
	}
}
