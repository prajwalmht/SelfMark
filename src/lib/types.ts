export type Profile = { id: string; display_name: string | null; role: 'reader' | 'admin' }
export type Book = {
  id: string; title: string; author: string; description: string | null
  cover_url: string | null; pdf_path: string; total_pages: number | null; published: boolean
}
export type Note = { id: string; book_id: string; page_number: number; content: string; created_at: string }
