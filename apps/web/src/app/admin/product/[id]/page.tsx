'use client'

import { useParams } from 'next/navigation'
import { ProductForm } from '@/components/admin/ProductForm'

export default function EditProductPage() {
  const params = useParams<{ id: string }>()
  return <ProductForm productId={params.id} />
}
