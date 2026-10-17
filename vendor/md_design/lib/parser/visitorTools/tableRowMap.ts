import { TableCellElement } from "@/elements/tableCellElement"
import { TableColumnElement } from "@/elements/tableColumnElement"
import { TableElement } from "@/elements/tableElement"
import { TableRowElement } from "@/elements/tableRowElement"
import { HierarchyManager } from "./hierarchyManager"
import { TableHeaderMap } from "./tableHeaderMap"
import { ElementListType } from "@/elements/types"

export class TableRowMap {
  private readonly hierarchy: HierarchyManager
  private currentRow: TableRowElement = new TableRowElement()

  private readonly table: TableElement
  private readonly headerMap: TableHeaderMap
  private readonly headerCells: Map<TableColumnElement, TableCellElement[]> = new Map()

  private currentLevel: number = 0
  private isFirstCell: boolean = true

  constructor(table: TableElement, headerMap: TableHeaderMap) {
    this.table = table
    this.headerMap = headerMap
    this.hierarchy = new HierarchyManager("rows", (item) => this.getDefaultParent(item))
  }

  public addRow(): void {
    this.isFirstCell = true
    this.headerMap.rollHeaderRow()

    if (this.headerMap.onFirstRow()) {
      this.hierarchy.set(this.currentRow, this.currentLevel)
      this.currentRow = new TableRowElement()
    }

    if (this.currentLevel) {
      this.table.type = "Дерево"
      this.table.typeDescription.types = ["ДеревоЗначений"]
    }
  }

  public addElement(item: TableCellElement, level: number): void {
    // Local patch: property-only cells still carry meaningful presentation data.
    const isEmpty = !item.hasCheckbox && item.value.trim() == "" && item.properties.size === 0

    // Only the first empty node represents the optional leading pipe.
    const skipLeadingPipe = this.isFirstCell && this.headerMap.isSkipableColumn() && isEmpty
    this.isFirstCell = false
    if (skipLeadingPipe) return

    if (this.headerMap.onFirstRow() && this.headerMap.onFirstColumn()) {
      this.currentLevel = level
    }

    if (isEmpty) {
      this.headerMap.nextColumn()
      return
    }

    const column = this.headerMap.getCurrentColumn()
    if (!column || this.currentRow.items.has(column)) {
      throw new Error("Строка таблицы содержит лишнюю ячейку или повторное значение объединённой колонки")
    }

    if (item.hasCheckbox) {
      column.hasCheckbox = true
    }

    if (item.value || !item.hasCheckbox) {
      column.hasValue = true
    }

    this.currentRow.items.set(column, item)

    this.headerMap.nextColumn()
  }

  public getHeaderCells(): Map<TableColumnElement, TableCellElement[]> {
    return this.headerCells
  }

  public validateCompleteRow(): void {
    if (!this.headerMap.onFirstRow()) {
      throw new Error("Незавершённая многострочная запись таблицы: добавьте оставшиеся строки")
    }
  }

  public initializeHeaderCellsMap(): void {
    let columns = this.headerMap.getColumns()
    for (let column of columns) {
      this.headerCells.set(column, [])
    }
    this.headerMap.resetColumnsCounter()
  }

  private getDefaultParent(item: TableRowElement): TableRowElement {
    this.table.add(ElementListType.Rows, [item])
    return item
  }
}
