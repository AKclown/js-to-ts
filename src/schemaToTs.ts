import { window } from "vscode";
import * as t from "@babel/types";
import generate from "@babel/generator";
import traverse, { NodePath } from "@babel/traverse";
import { ParseResult, parse } from "@babel/parser";
import { BaseClass } from "./BaseClass";
import { CUSTOM_CONFIG } from "./constant";
import { ISchemaToTs } from "./interface/SchemaToTs.interface";
import { ErrorEnum } from "./interface/Logger.interface";
import { Logger } from "./Logger";

export class schemaToTs extends BaseClass implements ISchemaToTs {

    /** 指定路径的schemas路径 (Schema) */
    private schema: Set<string>;

    constructor() {
        super();
        this.schema = new Set([]);
    }

    schemaToTs() {
        try {
            const activeEditor = window.activeTextEditor;
            if (!activeEditor) {
                return;
            }
            const selectData = this.getSelectedInfo();
            if (selectData.length) {
                selectData.forEach(async (item) => {
                    const { text, range } = item;
                    const tsCode = this.parseSchemaCode(text);

                    // 是否打开临时文件展示内容
                    const openTemporaryFile = this.getConfig(
                        CUSTOM_CONFIG.OPEN_TEMPORARY_FILE
                    ) as boolean;

                    if (openTemporaryFile) {
                        this.openTemporaryFile(tsCode);
                    } else {
                        activeEditor.edit((editorContext) =>
                            editorContext.replace(range, tsCode)
                        );
                    }
                });
            }
        } catch (error: any) {
            Logger.error({
                type: ErrorEnum.UNKNOWN_MISTAKE,
                data: error.message,
                items: ["issue"],
            });
        }
    }

    // schemaJson规范: https://json-schema.org/
    parseSchemaCode(text: string, specificPath?: string) {
        this.schema.clear();
        const updateText = `const RootObject = ${text}`;
        const ast: ParseResult<t.File> = parse(updateText);
        if (specificPath) {
            this.getSchemaByPath(ast, specificPath);
            if (this.schema.size) {
                const cloneSchema = new Set([...this.schema]);
                this.relatedSchema(ast, cloneSchema);
                this.traverseSchemaCode(ast);
            }
        } else {
            this.traverseSchemaCode(ast);
        }
        const code = generate(ast).code;
        return code;
    }

    getSchemaByPath(ast: ParseResult<t.File>, specificPath: string) {
        const prefix = this.getConfig(CUSTOM_CONFIG.PREFIX) as string ?? '';
        // 是否追加export
        const exportType = this.getConfig(CUSTOM_CONFIG.EXPORT_TYPE) as boolean;
        const _that = this;
        traverse(ast, {
            ObjectProperty(path: NodePath<t.ObjectProperty>) {
                let complexNum = 0;
                let key = path.node.key as t.StringLiteral;
                const programNode = path.findParent((path) =>
                    path.isProgram()
                )!;
                const body = (programNode.node as t.Program).body;
                if (key.value !== 'paths') {
                    // 跳过其余节点
                    path.skip();
                    return;
                }

                const state = { level: 0 };
                path.get("value").traverse({
                    enter() {
                        state.level++;
                    },
                    ObjectProperty(path: NodePath<t.ObjectProperty>) {
                        const attributeKey = path.node.key as t.StringLiteral;
                        const attributeName = attributeKey.value;
                        const type = JSON.parse(generate(path.node.value).code);

                        if (state.level === 1 && attributeName !== specificPath) {
                            // 过滤掉路径不是指定路径的节点
                            path.skip();
                            state.level--;
                            return;
                        }

                        if (state.level === 5 && attributeName !== "responses") {
                            // 过滤掉除“responses”之外的节点
                            path.skip();
                            state.level--;
                            return;
                        }

                        // 获取到schema的数据，基本类型和复杂类型
                        if (attributeName === 'type') {
                            // 普通类型 
                            _that.schema.add(type);
                        } else if (attributeName === '$ref') {
                            // 复杂类型
                            const identifier = type.substring(type.lastIndexOf('/') + 1);
                            _that.schema.add(identifier);
                            complexNum++;
                        }
                    },
                    exit() {
                        state.level--;
                    }
                });

                // 只存在一个复杂schema类型时，不需要生成新的RootObject节点
                if (complexNum === 1 && _that.schema.size !== 1) {
                    const unionType = _that.schema.size ? Array.from(_that.schema).map(type => {
                        if (type === 'number') {
                            _that.schema.delete(type);
                            return t.tsNumberKeyword();
                        } else if (type === 'string') {
                            _that.schema.delete(type);
                            return t.tsStringKeyword();
                        } else if (type === 'boolean') {
                            _that.schema.delete(type);
                            return t.tsBooleanKeyword();
                        } else if (type === 'null') {
                            _that.schema.delete(type);
                            return t.tsNullKeyword();
                        } else if (type === 'undefined') {
                            _that.schema.delete(type);
                            return t.tsUndefinedKeyword();
                        } else {

                            return t.tsTypeReference(t.identifier(type));
                        }
                    }) : [t.tsUnknownKeyword()];
                    const tsDeclaration = t.tsTypeAliasDeclaration(
                        t.identifier(`${prefix}RootObject`),
                        null,
                        t.tsUnionType(unionType)
                    );
                    body.push(exportType ? t.exportNamedDeclaration(tsDeclaration, []) : tsDeclaration);


                    if (!_that.schema.size) {
                        // $ 不存在复杂的schema类型,后续不会再进行tree的遍历.去掉原本节点树
                        body.splice(0, 1);
                    }
                }
            }
        });
    }

    relatedSchema(ast: ParseResult<t.File>, names: Set<string>) {
        // 获取到schema的依赖关系列表
        const _that = this;
        traverse(ast, {
            ObjectProperty(path: NodePath<t.ObjectProperty>) {
                let key = path.node.key as t.StringLiteral;
                const whitelist = ["components", "schemas"];
                if (!whitelist.includes(key.value)) {
                    // 跳过其余节点
                    path.skip();
                    return;
                }
                if (key.value === 'schemas') {
                    const state = { level: 0 };
                    path.get("value").traverse({
                        enter() {
                            state.level++;
                        },
                        ObjectProperty(path: NodePath<t.ObjectProperty>) {
                            const attributeKey = path.node.key as t.StringLiteral;
                            const attributeName = attributeKey.value;
                            if (state.level === 1 && !names.has(attributeName)) {
                                // 跳过无关节点
                                path.skip();
                                state.level--;
                                return;
                            }

                            if ('$ref' === attributeName) {
                                const type = JSON.parse(generate(path.node.value).code);
                                const identifier = type.substring(type.lastIndexOf('/') + 1);
                                names.add(identifier);
                                _that.schema.add(identifier);
                            }
                        },
                        exit(path) {
                            state.level--;
                            if (!state.level) {
                                const attributeKey = (path.node as t.ObjectProperty).key as t.StringLiteral;
                                const attributeName = attributeKey.value;
                                names.delete(attributeName);
                            }
                        }
                    });
                }
            }
        });
        if (names.size) {
            this.relatedSchema(ast, names);
        }
    }

    traverseSchemaCode(ast: ParseResult<t.File>) {
        const prefix = this.getConfig(CUSTOM_CONFIG.PREFIX) as string ?? '';
        // 属性是否为可选
        const optional = this.getConfig(CUSTOM_CONFIG.OPTIONAL) as boolean;
        // 是否追加export
        const exportType = this.getConfig(CUSTOM_CONFIG.EXPORT_TYPE) as boolean;
        const _that = this;
        traverse(ast, {
            ObjectProperty(path: NodePath<t.ObjectProperty>) {
                const programNode = path.findParent((path) =>
                    path.isProgram()
                )!;
                const body = (programNode.node as t.Program).body;
                let key = path.node.key as t.StringLiteral;
                const whitelist = ["components", "schemas"];
                if (!whitelist.includes(key.value)) {
                    // 跳过其余节点
                    path.skip();
                    return;
                }
                if (key.value === 'schemas') {
                    const state = { level: 0 };
                    path.get("value").traverse({
                        enter() {
                            state.level++;
                        },
                        ObjectProperty(path: NodePath<t.ObjectProperty>) {
                            const attributeKey = path.node.key as t.StringLiteral;
                            const attributeName = attributeKey.value;
                            if (_that.schema.size && state.level === 1 && !_that.schema.has(attributeName)) {
                                // $ 非指定的schema直接跳过
                                path.skip();
                                state.level--;
                                return;
                            }

                            // 有可能类型为{key:number} => 对应是schema为 {type:{key:number}} 以及不与properties平级的type属性
                            if (['type', '$ref'].includes(attributeName) && state.level === 7) {
                                let typeAnnotation: t.TSType = t.tsUnknownKeyword();
                                const type = JSON.parse(generate(path.node.value).code);
                                if (attributeName === 'type') {
                                    if (type === 'number') {
                                        typeAnnotation = t.tsNumberKeyword();
                                    } else if (type === 'string') {
                                        typeAnnotation = t.tsStringKeyword();
                                        /**
                                         * 1. 兄弟节点是否存在"format": "date-time"，表示是否为Date类型
                                         * 2. 兄弟节点是否存在"enum": 表示是否为枚举类型
                                         */
                                        const prevNodes = path.getAllPrevSiblings();
                                        const nextNodes = path.getAllNextSiblings();
                                        const siblings = [...prevNodes, ...nextNodes];

                                        for (let p of siblings) {
                                            const node = p.node as t.ObjectProperty;
                                            const attributeName = (node.key as t.StringLiteral).value;
                                            if (attributeName === 'enum') {
                                                const enumData = JSON.parse(generate(node.value).code);
                                                // TODO 后续分拆成枚举类型声明
                                                const unionType = _that.getUnionType(enumData);
                                                typeAnnotation = t.tsUnionType(unionType);
                                                break;
                                            } else if (attributeName === 'format') {
                                                const code = JSON.parse(generate(path.node.value).code);
                                                if (code === 'date-time') {
                                                    typeAnnotation = t.tsTypeReference(t.identifier('Date'));
                                                    break;
                                                }
                                            }
                                        }

                                    } else if (type === 'boolean') {
                                        typeAnnotation = t.tsBooleanKeyword();
                                    } else if (type === 'null') {
                                        typeAnnotation = t.tsNullKeyword();
                                    } else if (type === 'undefined') {
                                        typeAnnotation = t.tsUndefinedKeyword();
                                    } else if (type === 'array') {
                                        const items = path.getNextSibling().node as t.ObjectProperty;
                                        const code = JSON.parse(generate(items.value).code);
                                        typeAnnotation = t.tsArrayType(_that.getComplexType(code));
                                    } else if (type === 'object') {
                                        const items = path.getNextSibling().node as t.ObjectProperty;
                                        const code = JSON.parse(generate(items.value).code);
                                        typeAnnotation = _that.getComplexType(code);
                                    } else if (type === 'integer') {
                                        typeAnnotation = t.tsNumberKeyword();

                                        const prevNodes = path.getAllPrevSiblings();
                                        const nextNodes = path.getAllNextSiblings();
                                        const siblings = [...prevNodes, ...nextNodes];

                                        for (let p of siblings) {
                                            const node = p.node as t.ObjectProperty;
                                            const attributeName = (node.key as t.StringLiteral).value;
                                            if (attributeName === 'enum') {
                                                const enumData = JSON.parse(generate(node.value).code);
                                                // TODO 后续分拆成枚举类型声明
                                                const unionType = _that.getUnionType(enumData);
                                                typeAnnotation = t.tsUnionType(unionType);
                                                break;
                                            }
                                        }

                                    } else {
                                        // 其他类型一律unknown
                                        typeAnnotation = t.tsUnknownKeyword();
                                    }
                                } else if (attributeName === '$ref') {
                                    const identifier = type.substring(type.lastIndexOf('/') + 1);
                                    typeAnnotation = t.tsTypeReference(t.identifier(identifier));

                                }
                                const parentPath = path.parentPath.parentPath!.parentPath!.parentPath;
                                const prevNodes = parentPath!.getAllPrevSiblings();
                                const nextNodes = parentPath!.getAllNextSiblings();
                                const siblings = [...prevNodes, ...nextNodes];
                                let required = [];
                                for (let p of siblings) {
                                    const node = p.node as t.ObjectProperty;
                                    const attributeName = (node.key as t.StringLiteral).value;
                                    if (attributeName === 'required') {
                                        required = JSON.parse(generate(node.value).code);
                                        break;
                                    }
                                }
                                const key = ((path.parentPath.parent as t.ObjectProperty).key as t.StringLiteral).value;

                                const node = t.tsPropertySignature(
                                    t.identifier(key),
                                    t.tsTypeAnnotation(typeAnnotation)
                                );

                                // // 属性是否为可选
                                node.optional = optional || !required.includes(key);
                                path.parentPath!.parentPath!.replaceWith(node);
                                path.skip();
                                // $ 当调用了path.skip时当前节点的exit不会被触发
                                state.level--;
                            } else if (state.level === 1) {
                                // 存在没有properties子节点属性的情况, 当不存在时，这一层就需要处理类型了
                                const properties = (path.node.value as t.ObjectExpression).properties;
                                let isExistProperties = false;
                                let type = '';
                                let enumData = [];
                                let formatData = '';
                                for (let p of properties) {
                                    const key = ((p as t.ObjectProperty).key as t.StringLiteral).value;
                                    if (key === 'properties') {
                                        isExistProperties = true;
                                    } else if (key === 'type') {
                                        type = JSON.parse(generate((p as t.ObjectProperty).value).code);
                                    } else if (key === 'enum') {
                                        enumData = JSON.parse(generate((p as t.ObjectProperty).value).code);
                                    } else if (key === 'format') {
                                        formatData = JSON.parse(generate((p as t.ObjectProperty).value).code);
                                    }
                                }

                                if (!isExistProperties) {
                                    let typeAnnotation: t.TSType = t.tsUnknownKeyword();
                                    // 没有子属性properties，不在往下递归
                                    if (type === 'number') {
                                        typeAnnotation = t.tsNumberKeyword();
                                    } else if (type === 'string') {
                                        typeAnnotation = t.tsStringKeyword();
                                        /**
                                         * 1. 是否存在"format": "date-time"，表示是否为Date类型
                                         * 2. 是否存在"enum": 表示是否为枚举类型
                                         */
                                        if (enumData.length) {
                                            const unionType = _that.getUnionType(enumData);
                                            typeAnnotation = t.tsUnionType(unionType);
                                        } else if (formatData === 'date-time') {
                                            typeAnnotation = t.tsTypeReference(t.identifier('Date'));
                                        }
                                    } else if (type === 'boolean') {
                                        typeAnnotation = t.tsBooleanKeyword();
                                    } else if (type === 'null') {
                                        typeAnnotation = t.tsNullKeyword();
                                    } else if (type === 'undefined') {
                                        typeAnnotation = t.tsUndefinedKeyword();
                                    } else if (type === 'array') {
                                        typeAnnotation = t.tsArrayType(t.tsUnknownKeyword());
                                    } else if (type === 'object') {
                                        typeAnnotation = t.tsTypeReference(t.identifier('Record<string, unknown>'));
                                    } else if (type === 'integer') {
                                        typeAnnotation = t.tsNumberKeyword();
                                        if (enumData.length) {
                                            const unionType = _that.getUnionType(enumData);
                                            typeAnnotation = t.tsUnionType(unionType);
                                        }
                                    } else {
                                        // 其他类型一律unknown
                                        typeAnnotation = t.tsUnknownKeyword();
                                    }

                                    const key = ((path.node as t.ObjectProperty).key as t.StringLiteral).value;

                                    const tsDeclaration = t.tsTypeAliasDeclaration(
                                        t.identifier(`${prefix}${key}`),
                                        null,
                                        typeAnnotation
                                    );

                                    const programNode = path.findParent((path) =>
                                        path.isProgram()
                                    )!;
                                    (programNode.node as t.Program).body.push(exportType ? t.exportNamedDeclaration(tsDeclaration, []) : tsDeclaration);

                                    path.skip();
                                    // $ 当调用了path.skip时当前节点的exit不会被触发
                                    state.level--;
                                }
                            }
                        },
                        exit() {
                            // ?? 暂时不知道为啥state.level===3时，拿不到对应properties下的属性
                            state.level--;
                        }
                    });

                    // $ 生成类型体数据
                    path.get("value").traverse({
                        enter() {
                            state.level++;
                        },
                        ObjectProperty(path: NodePath<t.ObjectProperty>) {
                            const attributeKey = path.node.key as t.StringLiteral;
                            const attributeName = attributeKey.value;
                            if (_that.schema.size && state.level === 1 && !_that.schema.has(attributeName)) {
                                // $ 非指定的schema直接跳过
                                path.skip();
                                state.level--;
                                return;
                            }
                            if (state.level === 3 && attributeName === 'properties') {
                                const parentNode = path.parentPath!.parentPath!.node as t.ObjectProperty;
                                const name = (parentNode.key as t.StringLiteral).value;
                                let properties = (path.node.value as t.ObjectExpression).properties as unknown as Array<t.TSTypeElement>;
                                // 有可能数据不存在type|$ref字段，导致上面变量没有被转换为TSTypeElement类型，在这一层转换。 
                                // 案例数据: "value":{"nullable": true }
                                properties = properties.map(property => {
                                    if (t.isTSPropertySignature(property)) {
                                        return property;
                                    } else {
                                        const key = ((property as unknown as t.ObjectProperty).key as t.StringLiteral).value;
                                        return t.tsPropertySignature(
                                            t.identifier(key),
                                            t.tsTypeAnnotation(t.tsUnknownKeyword())
                                        );
                                    }
                                });

                                let tsDeclaration = t.tsInterfaceDeclaration(
                                    t.identifier(`${prefix}${name}`),
                                    null,
                                    null,
                                    t.tsInterfaceBody(properties)
                                );
                                const programNode = path.findParent((path) =>
                                    path.isProgram()
                                )!;
                                body.push(exportType ? t.exportNamedDeclaration(tsDeclaration, []) : tsDeclaration);
                            }
                        },
                        exit() {
                            state.level--;
                        }
                    });

                    // 去掉原本节点树
                    body.splice(0, 1);
                    path.skip();
                }
            }
        });
    }

    getComplexType(items: Record<string, any>): t.TSType {
        for (let key in items) {
            const type = items[key];
            if (key === 'type') {
                if (type === 'number') {
                    return t.tsNumberKeyword();
                } else if (type === 'string') {
                    if (items.format === 'date-time') {
                        // 日期类型
                        return t.tsTypeReference(t.identifier('Date'));
                    } else if (items.enum) {
                        // 枚举类型
                        const unionType = this.getUnionType(items.enum);
                        return t.tsUnionType(unionType);
                    }
                    return t.tsStringKeyword();
                } else if (type === 'boolean') {
                    return t.tsBooleanKeyword();
                } else if (type === 'null') {
                    return t.tsNullKeyword();
                } else if (type === 'undefined') {
                    return t.tsUndefinedKeyword();
                } else if (type === 'array') {
                    if (items.items) {
                        return t.tsArrayType(this.getComplexType(items.items));
                    } else {
                        return t.tsArrayType(t.tsAnyKeyword());
                    }
                } else if (type === 'object') {
                    if (items.items) {
                        return this.getComplexType(items.items);
                    } else {
                        return t.tsTypeReference(t.identifier('Record<string, unknown>'));
                    }
                }
                // 其他类型一律unknown
                return t.tsUnknownKeyword();
            } else if (key === '$ref') {
                const identifier = type.substring(type.lastIndexOf('/') + 1);
                return t.tsTypeReference(t.identifier(identifier));
            } else if (['oneOf', 'anyOf'].includes(key)) {
                const unionType = type.map((i: any) => this.getComplexType(i));
                return t.tsUnionType(unionType);
            } else if (key === 'allOf') {
                const unionType = type.map((i: any) => this.getComplexType(i));
                return t.tsIntersectionType(unionType);
            }
        }
        return t.tsUnknownKeyword();
    }

    getUnionType(enumData: Array<number | string>) {
        return enumData.map((i: number | string) => {
            if (typeof i === "number") {
                return t.tsLiteralType(t.numericLiteral(i));
            } else {
                return t.tsLiteralType(t.stringLiteral(i));
            }
        });
    }
}