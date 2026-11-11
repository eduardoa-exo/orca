import { describe, expect, it } from 'vitest'
import { parseCodeSymbols } from './code-symbols'
import {
  buildWorkspaceCodeSymbolSearches,
  collectWorkspaceCodeSymbolHits
} from './workspace-code-symbol-query'

const PYTHON_SOURCE = `"""Module docstring.

def not_a_symbol():
"""
from odoo import api, fields, models

DEFAULT_STATE = 'draft'


class SaleOrder(models.Model):
    _name = 'sale.order'
    _inherit = ['mail.thread']

    name = fields.Char(
        string="Name",
        required=True,
    )

    @api.depends('line_ids')
    def _compute_total(self):
        total = 0
        for line in self.line_ids:
            total += line.amount

    async def action_confirm(self):
        """Confirms.
        class NotAClass:
        """
        return True


def helper(value):
    result = value
    return result
`

const XML_SOURCE = `<odoo>
    <!-- <record id="commented" model="x"/> -->
    <record id="view_order_form" model="ir.ui.view">
        <field name="name">sale.order.form</field>
    </record>
    <template
        id="portal_layout"
        name="Portal Layout"
        inherit_id="web.layout">
    </template>
    <menuitem id="menu_sale_root" name="Sales"/>
</odoo>
`

describe('parseCodeSymbols', () => {
  it('nests Python classes, methods and class attributes, skipping strings and locals', () => {
    expect(parseCodeSymbols('python', PYTHON_SOURCE)).toEqual([
      {
        name: 'DEFAULT_STATE',
        kind: 'variable',
        detail: 'draft',
        line: 7,
        column: 1,
        children: []
      },
      {
        name: 'SaleOrder',
        kind: 'class',
        line: 10,
        column: 7,
        children: [
          {
            name: '_name',
            kind: 'attribute',
            detail: 'sale.order',
            line: 11,
            column: 5,
            children: []
          },
          { name: '_inherit', kind: 'attribute', line: 12, column: 5, children: [] },
          { name: 'name', kind: 'field', detail: 'fields.Char', line: 14, column: 5, children: [] },
          { name: '_compute_total', kind: 'method', line: 20, column: 9, children: [] },
          { name: 'action_confirm', kind: 'method', line: 25, column: 15, children: [] }
        ]
      },
      { name: 'helper', kind: 'function', line: 32, column: 5, children: [] }
    ])
  })

  it('reads Odoo XML ids across multi-line tags and ignores comments', () => {
    expect(parseCodeSymbols('xml', XML_SOURCE)).toEqual([
      {
        name: 'view_order_form',
        kind: 'record',
        detail: 'ir.ui.view',
        line: 3,
        column: 17,
        children: []
      },
      {
        name: 'portal_layout',
        kind: 'template',
        detail: 'Portal Layout',
        line: 7,
        column: 13,
        children: []
      },
      {
        name: 'menu_sale_root',
        kind: 'menuitem',
        detail: 'Sales',
        line: 11,
        column: 19,
        children: []
      }
    ])
  })

  it('returns null for unsupported languages', () => {
    expect(parseCodeSymbols('rust', 'fn main() {}')).toBeNull()
  })
})

describe('workspace code symbol search', () => {
  it('drops method locals and inherit_id hits, ranking exact names first', () => {
    const [python, xml] = buildWorkspaceCodeSymbolSearches('confirm')
    const hits = collectWorkspaceCodeSymbolHits('confirm', [
      {
        search: python,
        result: {
          truncated: false,
          totalMatches: 3,
          files: [
            {
              filePath: '/repo/sale/models/sale.py',
              relativePath: 'sale/models/sale.py',
              matches: [
                {
                  line: 40,
                  column: 1,
                  matchLength: 1,
                  lineContent: '    def action_confirm(self):'
                },
                {
                  line: 41,
                  column: 1,
                  matchLength: 1,
                  lineContent: '        confirm_date = now()'
                },
                {
                  line: 50,
                  column: 1,
                  matchLength: 1,
                  lineContent: '    confirm = fields.Boolean()'
                }
              ]
            }
          ]
        }
      },
      {
        search: xml,
        result: {
          truncated: false,
          totalMatches: 1,
          files: [
            {
              filePath: '/repo/sale/views/sale.xml',
              relativePath: 'sale/views/sale.xml',
              matches: [
                {
                  line: 9,
                  column: 1,
                  matchLength: 1,
                  lineContent: '<template id="layout" inherit_id="web.confirm_layout">'
                }
              ]
            }
          ]
        }
      }
    ])
    expect(hits).toEqual([
      {
        name: 'confirm',
        kind: 'field',
        detail: 'fields.Boolean',
        filePath: '/repo/sale/models/sale.py',
        relativePath: 'sale/models/sale.py',
        line: 50,
        column: 5
      },
      {
        name: 'action_confirm',
        kind: 'method',
        filePath: '/repo/sale/models/sale.py',
        relativePath: 'sale/models/sale.py',
        line: 40,
        column: 9
      }
    ])
  })
})
