import { Button, Wordmark } from "@smthrs/ui"
import { Link } from "@tanstack/react-router"
import "./landing.css"

const SOURCE_URL = "https://github.com/smithersai/smithers"

export function Landing() {
  return (
    <main className="landing">
      <h1 className="landing-title" aria-label="Smithers">
        <Wordmark />
      </h1>
      <p className="landing-tagline">Automate maintaining your codebase</p>
      <nav className="landing-actions" aria-label="Start">
        <Button asChild variant="solid" size="lg">
          <Link to="/app">Get started for free</Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
        </Button>
      </nav>
    </main>
  )
}
