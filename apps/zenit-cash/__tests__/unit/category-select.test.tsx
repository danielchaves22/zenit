import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CategorySelect, {
  orderCategoriesForSelect,
  type CategoryOption
} from '@/components/financial/CategorySelect'

const categories: CategoryOption[] = [
  {
    id: 2,
    name: 'Combustível',
    color: '#ef4444',
    parentId: 1
  },
  {
    id: 3,
    name: 'Saúde',
    color: '#10b981'
  },
  {
    id: 1,
    name: 'Transporte',
    color: '#3b82f6'
  },
  {
    id: 4,
    name: 'Farmácia',
    color: '#22c55e',
    parentId: 3
  }
]

describe('CategorySelect', () => {
  it('orders subcategories immediately after their parent category', () => {
    const ordered = orderCategoriesForSelect(categories)

    expect(ordered.map((item) => item.category.id)).toEqual([3, 4, 1, 2])
    expect(ordered.map((item) => item.level)).toEqual([0, 1, 0, 1])
    expect(ordered[1]?.lineage).toEqual(['Saúde'])
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
      screen.getByRole('button', { name: /Transporte \/ Combustível/i })
    ).toBeInTheDocument()
  })
})
