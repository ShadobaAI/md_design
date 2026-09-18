import "reflect-metadata"
import { Lexer, createToken, type IToken } from "chevrotain"
import { multiModeLexerDefinition, Text, combineTokens } from "@/parser/lexer"
import { Parser } from "@/parser/parser"
import { GroupVisitor } from "@/parser/groupVisitor"
import { Visitor } from "@/parser/visitor"
import { SemanticTokensManager } from "@/parser/visitorTools/sematicTokensManager"
import { FormElement } from "@/elements"

export const MAX_TEXT_LENGTH = 200_000

// Upstream resets parser.errors between groups. Check each group before that reset.
class CheckedParser extends Parser {
  check(): void {
    const error = this.errors[0]
    if (error) throw new Error(`Строка ${error.token.startLine ?? "?"}: ${error.message}`)
  }
  override parseFields(tokens: IToken[]) {
    const result = super.parseFields(tokens)
    this.check()
    return result
  }
}
// Additive lexer compatibility fix: upstream silently drops quotes and typographic punctuation. Keep all structural delimiters unchanged and preserve literal text.
Text.PATTERN = /[a-zA-Zа-яА-ЯёЁ№!%0-9"'«»“”„…?$€₽–—−][a-zA-Zа-яА-ЯёЁ№!%0-9"'«»“”„…?$€₽–—−\t ]*/
const hexColor = createToken({ name: "HexColor", pattern: /#[0-9a-fA-F]{6}(?![0-9a-fA-F])/, categories: combineTokens })
const lexer = new Lexer({
  ...multiModeLexerDefinition,
  modes: { ...multiModeLexerDefinition.modes, properties_mode: [hexColor, ...multiModeLexerDefinition.modes.properties_mode] },
}, { ensureOptimizations: false })
const parser = new CheckedParser()

export function parseForm(text: string): FormElement {
  if (text.length > MAX_TEXT_LENGTH) throw new Error("Форма превышает лимит 200 000 символов")
  const lexed = lexer.tokenize(text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n"))
  if (lexed.errors.length) {
    const e = lexed.errors[0]
    throw new Error(`Строка ${e.line}, столбец ${e.column}: ${e.message}`)
  }
  parser.input = lexed.tokens
  const ast = parser.parseForm()
  parser.check()
  const grouped = new GroupVisitor(parser).visit(ast)
  const form = new Visitor(new SemanticTokensManager()).visit(grouped)
  if (!(form instanceof FormElement)) throw new Error("Не удалось разобрать форму")
  return form
}
