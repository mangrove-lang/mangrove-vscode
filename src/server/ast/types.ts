import {SemanticToken, SemanticTokenTypes} from '../../providers/semanticTokens'
import {Token} from '../parser/types'

export enum ASTType
{
	invalid,
	comment,
	ident,
	dottedIdent,
	intValue,
	floatValue,
	stringLitValue,
	charLitValue,
	boolValue,
	nullValue,
	listValue,
	keyValuePair,
	dictValue,
	slice,
	index,
	callArguments,
	functionCall,
	lambdaExpr,
	lambdaCall,
	deref,
	invert,
	prefix,
	postfix,
	mul,
	add,
	shift,
	bit,
	rel,
	between,
	logic,
	assign,
	deleteExpr,
	newExpr,
	importStmt,
	returnStmt,
	ifExpr,
	elifExpr,
	elseExpr,
	ifStmt,
	whileStmt,
	doStmt,
	classDef,
	locationSpec,
	storageSpec,
	params,
	returnType,
	functionDef,
	operatorDef,
	visibility,
	block
}

export enum ASTSpecialOp
{
	increment,
	decrement
}

export enum ASTIntType
{
	bin,
	oct,
	dec,
	hex
}

export enum ASTVisibilityType
{
	privateVis,
	publicVis,
	protectedVis
}

export class ASTNodeData
{
	protected _token: Token
	private _children: ASTNode[] = new Array<ASTNode>()

	constructor(token: Token) { this._token = token.clone() }

	get children() { return this._children }
	get token() { return this._token } // XXX: Needs removing when the parser is converted.

	add(nodes: ASTNode[]) { this._children.push(...nodes) }

	buildSemanticToken(semanticType: SemanticTokenTypes, token?: Token)
	{
		if (!token)
			token = this._token
		const location = token.location
		console.info(`Translating token ${token} to semantic type ${SemanticTokenTypes[semanticType]}`)
		return {
			line: location.start.line,
			character: location.start.character,
			length: token.length,
			type: semanticType
		} as SemanticToken
	}
}

export interface ASTNode extends ASTNodeData
{
	get type(): ASTType
	get valid(): boolean
	get semanticType(): SemanticTokenTypes | undefined
	semanticTokens(): Generator<SemanticToken, void, undefined>
	toString(): string

	// typeIs(type: ASTType) { return type === this.type }
}

export class ASTComment extends ASTNodeData implements ASTNode
{
	get type() { return ASTType.comment }
	get valid() { return true }
	get semanticType() { return SemanticTokenTypes.comment }

	*semanticTokens() { yield this.buildSemanticToken(this.semanticType) }
}

export function *generateSemanticTokens(node?: ASTNode, ...innerNodes: (ASTNode | undefined)[]): Generator<SemanticToken, void, undefined> 
{
	if (node && node.semanticType)
		yield node.buildSemanticToken(node.semanticType)
	
	for (const node of innerNodes) 
	{
		if (node)
			yield *node.semanticTokens()
	}
}
