import {TextDocument} from 'vscode-languageserver-textdocument'
import {SemanticToken, SemanticTokenTypes} from '../../providers/semanticTokens'
import {Token} from '../parser/types'
import {Parser} from '../parser/parser'
import {ASTNode, ASTNodeData, ASTType, ASTVisibilityType} from './types'
import {ASTIdent, ASTStorage, ASTTypeDecl} from './values'
import {ASTFunctionCall} from './operations'
import {SymbolTable} from './symbolTable'

export class ASTNew extends ASTNodeData implements ASTNode
{
	private _ctorCall: ASTFunctionCall

	constructor(newToken: Token, ctorCall: ASTFunctionCall)
	{
		super(newToken)
		this._ctorCall = ctorCall
	}

	get type() { return ASTType.newExpr }
	get valid() { return this.token.valid && this._ctorCall.valid }
	get semanticType() { return SemanticTokenTypes.keyword }
	toString() { return `<New '${this._ctorCall.functionName}'>` }

	*semanticTokens(): Generator<SemanticToken, void, undefined>
	{
		yield this.buildSemanticToken(this.semanticType)
		yield *this._ctorCall.semanticTokens()
		for (const child of this.children)
			yield *child.semanticTokens()
	}
}

export class ASTDelete extends ASTNodeData implements ASTNode
{
	private _ident: ASTIdent

	constructor(deleteToken: Token, ident: ASTIdent)
	{
		super(deleteToken)
		this._ident = ident
	}

	get type() { return ASTType.deleteExpr }
	get valid() { return this.token.valid && this._ident.valid }
	get semanticType() { return SemanticTokenTypes.keyword }
	toString() { return `<Delete: '${this._ident.fullName}'>` }

	*semanticTokens(): Generator<SemanticToken, void, undefined>
	{
		yield this.buildSemanticToken(this.semanticType)
		yield *this._ident.semanticTokens()
		for (const child of this.children)
			yield *child.semanticTokens()
	}
}

export class ASTReturn extends ASTNodeData implements ASTNode
{
	private _expr: ASTNode

	constructor(returnToken: Token, expr: ASTNode)
	{
		super(returnToken)
		this._expr = expr
	}

	get type() { return ASTType.returnStmt }
	get valid() { return this.token.valid && this._expr.valid }
	get semanticType() { return SemanticTokenTypes.keyword }
	toString() { return '<Return statement>' }

	*semanticTokens(): Generator<SemanticToken, void, undefined>
	{
		yield this.buildSemanticToken(this.semanticType)
		yield *this._expr.semanticTokens()
		for (const child of this.children)
			yield *child.semanticTokens()
	}
}

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

export class ASTElseExpr extends ASTNodeData implements ASTNode
{
	private _block: ASTNode

	constructor(elseToken: Token, block: ASTNode)
	{
		super(elseToken)
		this._block = block
	}

	get type() { return ASTType.elseExpr }
	get valid() { return this.token.valid && this._block.valid }
	get semanticType() { return SemanticTokenTypes.keyword }
	toString() { return '<Else expression>' }

	*semanticTokens(): Generator<SemanticToken, void, undefined>
	{
		yield this.buildSemanticToken(this.semanticType)
		yield *this._block.semanticTokens()
		for (const child of this.children)
			yield *child.semanticTokens()
	}
}

export class ASTIfStmt extends ASTNodeData implements ASTNode
{
	private _ifExpr: ASTIfExpr
	private _elifExprs: ASTElifExpr[] = []
	private _elseExpr?: ASTElseExpr

	constructor(ifExpr: ASTIfExpr, elifExprs: ASTElifExpr[], elseExpr?: ASTElseExpr)
	{
		super(new Token())
		this._ifExpr = ifExpr
		this._elifExprs = elifExprs
		this._elseExpr = elseExpr
	}

	get type() { return ASTType.ifStmt }
	get valid() { return this._ifExpr.valid && this._elifExprs.every(expr => expr.valid) }
	get semanticType() { return undefined }
	toString() { return '<If statement>' }

	*semanticTokens(): Generator<SemanticToken, void, undefined>
	{
		yield *this._ifExpr.semanticTokens()
		for (const elifExpr of this._elifExprs)
			yield *elifExpr.semanticTokens()
		if (this._elseExpr)
			yield *this._elseExpr.semanticTokens()
	}
}

export class ASTVisibility extends ASTNodeData implements ASTNode
{
	private _visibility: ASTVisibilityType

	constructor(token: Token)
	{
		super(token)
		this._visibility = this.stringToType(token.value)
	}

	get type() { return ASTType.visibility }
	get valid() { return this.token.valid }
	get semanticType() { return SemanticTokenTypes.keyword }
	get visibility() { return this._visibility }
	toString() { return `<Visibility: ${this.token.value}>` }

	*semanticTokens(): Generator<SemanticToken, void, undefined>
	{
		yield this.buildSemanticToken(this.semanticType)
		for (const child of this.children)
			yield *child.semanticTokens()
	}

	private stringToType(value: string)
	{
		if (value === 'public')
			return ASTVisibilityType.publicVis
		else if (value === 'protected')
			return ASTVisibilityType.protectedVis
		else if (value === 'private')
			return ASTVisibilityType.privateVis
		throw Error(`Invalid visibility value '${value}'`)
	}
}

export class ASTParams extends ASTNodeData implements ASTNode
{
	private _params: ASTTypeDecl[] = []

	get type() { return ASTType.params }
	get valid() { return this.parameters.every(arg => arg.valid) }
	get semanticType() { return SemanticTokenTypes.parameter }
	get empty() { return this.parameters.length == 0 }
	get parameters() { return this._params }
	toString() { return `<Parameters: ${this.parameters.length} parameters>` }

	addParameter(parameter: ASTTypeDecl) { this.parameters.push(parameter) }

	*semanticTokens(): Generator<SemanticToken, void, undefined>
	{
		// XXX: Need to get the semantic type for this node passed through to the name component of ASTTypeDecl.
		for (const parameter of this.parameters)
			yield *parameter.semanticTokens()
		for (const child of this.children)
			yield *child.semanticTokens()
	}

	adjustEnd(token: Token, file: TextDocument)
	{
		this._token.endsAt(token.location.end)
		this._token.calcLength(file)
	}
}

export class ASTReturnType extends ASTNodeData implements ASTNode
{
	private _functionTypeSpec?: ASTStorage
	private _returnType: ASTTypeDecl

	constructor(arrowToken: Token, functionTypeSpec: ASTStorage | undefined, returnType: ASTTypeDecl)
	{
		super(arrowToken)
		this._functionTypeSpec = functionTypeSpec
		this._returnType = returnType
	}

	get type() { return ASTType.returnType }
	get valid() { return this.token.valid && (this._functionTypeSpec?.valid ?? true) && this._returnType.valid }
	get semanticType() { return undefined }
	get functionTypeSpec() { return this._functionTypeSpec }
	get returnType() { return this._returnType }
	toString() { return `<ReturnType: '${this.returnType.fullName}' on ${this.functionTypeSpec?.specification ?? ''} function>` }

	*semanticTokens(): Generator<SemanticToken, void, undefined>
	{
		if (this.functionTypeSpec)
			yield *this.functionTypeSpec.semanticTokens()
		yield *this.returnType.semanticTokens()
	}
}

export class ASTClass extends ASTNodeData implements ASTNode
{
	private _name: ASTIdent
	private _body: ASTNode

	constructor(classToken: Token, name: ASTIdent, body: ASTNode)
	{
		super(classToken)
		this._name = name
		this._body = body
	}

	get type() { return ASTType.classDef }
	get valid() { return this.token.valid && this._name.valid && this.body.valid }
	get semanticType() { return SemanticTokenTypes.keyword }
	get name() { return this._name.fullName }
	// get symbolTable() { return this._name.symbolTable }
	get body() { return this._body }
	toString() { return `<Class: ${this.name}>` }

	*semanticTokens(): Generator<SemanticToken, void, undefined>
	{
		yield this.buildSemanticToken(this.semanticType)
		yield *this._name.semanticTokens()
		yield *this.body.semanticTokens()
		for (const child of this.children)
			yield *child.semanticTokens()
	}
}

export class ASTBlock extends ASTNodeData implements ASTNode
{
	private _symbolTable: SymbolTable
	private _statements: ASTNode[] = []

	constructor(token: Token, parser: Parser)
	{
		super(token)
		this._symbolTable = new SymbolTable(parser)
	}

	get type() { return ASTType.block }
	get valid() { return this._statements.every(stmt => stmt.valid) }
	get semanticType() { return undefined }
	get empty() { return this._statements.length == 0 }
	get statements() { return this._statements }
	get symbolTable() { return this._symbolTable }
	toString() { return `<Block: ${this.statements.length} statements>` }

	*semanticTokens(): Generator<SemanticToken, void, undefined>
	{
		for (const child of this.children)
			yield *child.semanticTokens()
	}

	addStatement(stmt: ASTNode)
	{
		this.add([stmt])
		this._statements.push(stmt)
	}

	adjustEnd(token: Token, file: TextDocument)
	{
		this._token.endsAt(token.location.end)
		this._token.calcLength(file)
	}
}
