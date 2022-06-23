import { Transform, CallExpression, ASTPath, JSCodeshift, ArrayExpression, Literal, MemberExpression, Identifier, OptionalMemberExpression } from "jscodeshift";

class Handler {
  private j: JSCodeshift;
  private path: ASTPath<CallExpression>;
  private argumentsMatch: boolean;
  private hasDefault!: boolean;

  constructor(j: JSCodeshift, path: ASTPath<CallExpression>) {
    this.j = j;
    this.path = path;
    this.argumentsMatch = this.checkArgumentContract();
  }

  checkArgumentContract() {
    const node = this.path.node;

    if (node.arguments.length == 0 || node.arguments.length > 2) {
      return false;
    }

    this.hasDefault = node.arguments.length === 2;

    return node.arguments[0].type === "ArrayExpression";
  }

  transform() {
    if (!this.argumentsMatch) {
      return;
    }

    const arrayArguments = this.path.node.arguments[0] as ArrayExpression;

    if (this.hasDefault) {
      const defaultExpression = this.path.node.arguments[1] as any;
      const isPartOfLogicalExpression = this.path.name === 'left' || this.path.name === 'right';
      const logicalExpression = this.j.logicalExpression(
          '??',
          this.generate(arrayArguments),
          defaultExpression,
      );

      this.path.replace(isPartOfLogicalExpression ? this.j.parenthesizedExpression(logicalExpression) : logicalExpression);
    } else {
      this.path.replace(this.generate(arrayArguments))
    }
  }

  private generate(arrayArguments: ArrayExpression, index = arrayArguments.elements.length - 1): Identifier | OptionalMemberExpression {
    if (index === -1) {
      const memberExpression = this.path.node.callee as MemberExpression;

      return (memberExpression.object as Identifier);
    } else {
      const arg = arrayArguments.elements[index];

      return this.j.optionalMemberExpression(
        this.generate(arrayArguments, index - 1),
        this.normalizeProperty(arg),
        this.isComputed(arg),
      );
    }
  }

  private normalizeProperty(arg: any) {
    if (arg?.type === 'Literal' || arg?.type === 'StringLiteral') {
      return this.j.identifier((arg as Literal).value + '');
    }
    
    return arg;
  }

  private isComputed(arg: any) {
    return !(arg?.type === 'Literal' || arg?.type === 'StringLiteral') ||
      arg?.type === 'NumericLiteral' || arg?.value !== null && !isNaN(+arg?.value);
  }
}

const transform: Transform = (file, api) => {
  const j = api.jscodeshift;
  const root = j(file.source);
  const collections = root.find(j.CallExpression, (p) => {
    const callee = p.callee;

    return (callee.type === 'MemberExpression' || callee.type === 'OptionalMemberExpression') &&
      callee.property.type === 'Identifier' &&
      callee.property.name === 'getIn';
  });

  collections.forEach((path) => new Handler(j, path).transform());

  return root.toSource();
};

export default transform;

