import { useEffect, useState, type FormEvent } from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import { Document, Page, pdfjs } from "react-pdf";
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { supabase } from "./lib/supabase";
import type { Book, Note, Profile } from "./lib/types";
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

function useSession() {
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
      if (user) {
        const { data } = await supabase
          .from("profiles")
          .select("id, display_name, role")
          .single();
        setProfile(data);
      }
      setLoading(false);
    };
    load();
    const { data: listener } = supabase.auth.onAuthStateChange(() => load());
    return () => listener.subscription.unsubscribe();
  }, []);
  return { userId, profile, loading };
}

function Header({ profile }: { profile: Profile | null }) {
  const navigate = useNavigate();
  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };
  return (
    <header>
      <Link className="brand" to="/">
        Shelfmark
      </Link>
      <nav>
        <Link to="/">Library</Link>
        {profile?.role === "admin" && <Link to="/admin">Admin</Link>}
        {profile ? (
          <button className="link-button" onClick={signOut}>
            Sign out
          </button>
        ) : (
          <Link to="/login">Sign in</Link>
        )}
      </nav>
    </header>
  );
}

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [message, setMessage] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    const result =
      mode === "signIn"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    if (result.error) setMessage(result.error.message);
    else if (mode === "signUp")
      setMessage("Check your email to confirm your account.");
    else navigate("/");
  };
  return (
    <main className="auth">
      <h1>
        {mode === "signIn" ? "Welcome back" : "Create your library account"}
      </h1>
      <form onSubmit={submit} className="card stack">
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <button>{mode === "signIn" ? "Sign in" : "Create account"}</button>
        {message && <p className="notice">{message}</p>}
        <button
          type="button"
          className="text"
          onClick={() => setMode(mode === "signIn" ? "signUp" : "signIn")}
        >
          {mode === "signIn" ? "Need an account?" : "Already have an account?"}
        </button>
      </form>
    </main>
  );
}

function Library() {
  const [books, setBooks] = useState<Book[]>([]);
  useEffect(() => {
    supabase
      .from("books")
      .select("*")
      .eq("published", true)
      .order("title")
      .then(({ data }) => setBooks(data ?? []));
  }, []);
  return (
    <main>
      <div className="hero">
        <p className="eyebrow">Your private shelf</p>
        <h1>Read at your own pace.</h1>
      </div>
      <section className="grid">
        {books.map((book) => (
          <article className="book card" key={book.id}>
            <div className="cover">
              {book.cover_url ? (
                <img src={book.cover_url} alt="" />
              ) : (
                book.title.slice(0, 1)
              )}
            </div>
            <div>
              <p className="eyebrow">{book.author}</p>
              <h2>{book.title}</h2>
              <p>{book.description}</p>
              <Link className="button" to={`/read/${book.id}`}>
                Open book
              </Link>
            </div>
          </article>
        ))}
        {books.length === 0 && <p>No books have been published yet.</p>}
      </section>
    </main>
  );
}

function Reader() {
  debugger;
  const { id } = useParams();
  const [book, setBook] = useState<Book | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [notes, setNotes] = useState<Note[]>([]);
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: item } = await supabase
        .from("books")
        .select("*")
        .eq("id", id)
        .single();
      if (!item) return;
      setBook(item);
      const { data: progress } = await supabase
        .from("reading_progress")
        .select("current_page")
        .eq("book_id", id)
        .maybeSingle();
      setPage(progress?.current_page ?? 1);
      const { data: signed } = await supabase.storage
        .from("book-pdfs")
        .createSignedUrl(item.pdf_path, 600);
      setUrl(signed?.signedUrl ?? null);
      const { data: savedNotes } = await supabase
        .from("notes")
        .select("*")
        .eq("book_id", id)
        .order("created_at", { ascending: false });
      setNotes(savedNotes ?? []);
    })();
  }, [id]);
  const saveProgress = async (newPage: number) => {
    if (!id) return

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return

    setPage(newPage)

    const { error } = await supabase.from('reading_progress').upsert(
      {
        user_id: user.id,
        book_id: id,
        current_page: newPage,
        percent_complete: pages
          ? Math.round((newPage / pages) * 100)
          : 0,
      },
      {
        onConflict: 'user_id,book_id',
      },
    )

    if (error) {
      console.error('Could not save reading progress:', error)
    }
  }
  const addNote = async (event: FormEvent) => {
    event.preventDefault();
    if (!id || !note.trim()) return;
    const { data, error } = await supabase
      .from("notes")
      .insert({ book_id: id, page_number: page, content: note.trim() })
      .select()
      .single();
    if (!error && data) {
      setNotes([data, ...notes]);
      setNote("");
    }
  };
  if (!book)
    return (
      <main>
        <p>Loading book...</p>
      </main>
    );
  return (
    <main className="reader">
      <section>
        <p className="eyebrow">{book.author}</p>
        <h1>{book.title}</h1>
        {url ? (
          <Document
            file={url}
            loading="Loading PDF..."
            onLoadSuccess={({ numPages }) => setPages(numPages)}
            onLoadError={(error) => {
              console.error('PDF load failed:', error);
            }}
          >
            <Page
              pageNumber={page}
              width={Math.min(window.innerWidth - 40, 760)}
            />
          </Document>
        ) : (
          <p>Unable to load this PDF.</p>
        )}
        <div className="controls">
          <button disabled={page <= 1} onClick={() => saveProgress(page - 1)}>
            Previous
          </button>
          <span>
            Page {page} of {pages || "..."}
          </span>
          <button
            disabled={pages > 0 && page >= pages}
            onClick={() => saveProgress(page + 1)}
          >
            Next
          </button>
        </div>
      </section>
      <aside className="notes card">
        <h2>Notes</h2>
        <form onSubmit={addNote} className="stack">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={`Note for page ${page}`}
            required
          />
          <button>Save note</button>
        </form>
        {notes.map((item) => (
          <article className="note" key={item.id}>
            <strong>Page {item.page_number}</strong>
            <p>{item.content}</p>
          </article>
        ))}
      </aside>
    </main>
  );
}

function Admin({ profile }: { profile: Profile | null }) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  if (profile?.role !== "admin") return <Navigate to="/" replace />;
  const upload = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || file.type !== "application/pdf")
      return setStatus("Select a PDF file.");
    setStatus("Creating book...");
    const { data: book, error } = await supabase
      .from("books")
      .insert({ title, author, description, pdf_path: "pending" })
      .select()
      .single();
    if (error || !book)
      return setStatus(error?.message ?? "Could not create book.");
    const path = `books/${book.id}/source.pdf`;
    const uploadResult = await supabase.storage
      .from("book-pdfs")
      .upload(path, file, { contentType: "application/pdf", upsert: false });
    if (uploadResult.error) {
      await supabase.from("books").delete().eq("id", book.id);
      return setStatus(uploadResult.error.message);
    }
    const update = await supabase
      .from("books")
      .update({ pdf_path: path, published: true })
      .eq("id", book.id);
    setStatus(update.error ? update.error.message : "Book published.");
    if (!update.error) {
      setTitle("");
      setAuthor("");
      setDescription("");
      setFile(null);
    }
  };
  return (
    <main>
      <div className="hero">
        <p className="eyebrow">Administration</p>
        <h1>Add a book</h1>
      </div>
      <form onSubmit={upload} className="card stack form">
        <label>
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </label>
        <label>
          Author
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            required
          />
        </label>
        <label>
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label>
          PDF
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            required
          />
        </label>
        <button>Upload and publish</button>
        {status && <p className="notice">{status}</p>}
      </form>
    </main>
  );
}

export default function App() {
  const { userId, profile, loading } = useSession();
  if (loading) return <main>Loading...</main>;
  return (
    <>
      <Header profile={profile} />
      <Routes>
        <Route
          path="/login"
          element={userId ? <Navigate to="/" replace /> : <Login />}
        />
        <Route
          path="/"
          element={userId ? <Library /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/read/:id"
          element={userId ? <Reader /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/admin"
          element={
            userId ? (
              <Admin profile={profile} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      </Routes>
    </>
  );
}
