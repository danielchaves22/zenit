import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import CategorySelect, {
  orderCategoriesForSelect,
  type CategoryOption
} from '@/components/financial/CategorySelect'

const categories: CategoryOption[] = [
  {
    id: 2,
    name: 'Combustivel',
    color: '#ef4444',
    parentId: 1
  },
  {
    id: 3,
    name: 'Saude',
    color: '#10b981'
  },
  {
    id: 1,
    name: 'Transporte',
    color: '#3b82f6'
  },
  {
    id: 4,
    name: 'Farmacia',
    color: '#22c55e',
    parentId: 3
  }
]

describe('CategorySelect', () => {
  it('orders subcategories immediately after their parent category', () => {
    const ordered = orderCategoriesForSelect(categories)

    expect(ordered.map((item) => item.category.id)).toEqual([3, 4, 1, 2])
    expect(ordered.map((item) => item.level)).toEqual([0, 1, 0, 1])
    expect(ordered[1]?.lineage).toEqual(['Saude'])
    expect(ordered[3]?.lineage).toEqual(['Transporte'])
  })

  it('shows the full hierarchy for the selected subcategory in the trigger', () => {
    render(
      <CategorySelect
        categories={categories}
        value="2"
        onChange={vi.fn()}
        placeholder="Sem categoria"
      />
    )

    expect(
      screen.getByRole('button', { name: /Transporte \/ Combustivel/i })
    ).toBeInTheDocument()
  })

  it('filters categories through the search field in the dropdown', async () => {
    const user = userEvent.setup()

    render(
      <CategorySelect
        categories={categories}
        value=""
        onChange={vi.fn()}
        placeholder="Sem categoria"
      />
    )

    await user.click(screen.getByRole('button', { name: /Sem categoria/i }))
    await user.type(
      screen.getByRole('textbox', { name: /Filtrar categorias/i }),
      'Farm'
    )

    expect(screen.getByRole('button', { name: /Farmacia/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Combustivel/i })).not.toBeInTheDocument()
  })

  it('opens the dropdown when typing on the trigger and seeds the filter', async () => {
    const user = userEvent.setup()

    render(
      <CategorySelect
        categories={categories}
        value=""
        onChange={vi.fn()}
        placeholder="Sem categoria"
      />
    )

    const trigger = screen.getByRole('button', { name: /Sem categoria/i })
    trigger.focus()
    await user.keyboard('f')

    expect(screen.getByRole('textbox', { name: /Filtrar categorias/i })).toHaveValue('f')
    expect(screen.getByRole('button', { name: /Farmacia/i })).toBeInTheDocument()
  })
})
