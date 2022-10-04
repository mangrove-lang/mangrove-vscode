export enum ASTType
{
	invalid,
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
	typeDef,
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

export interface ASTNode
{
	get type(): ASTType
	get valid(): boolean
	toString(): string

	// typeIs(type: ASTType): boolean
	// {
	// 	return type == this.type
	// }
}
