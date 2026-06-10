#!/usr/bin/env python3
"""
Web Scraper Tool
Fetches and extracts content from a single webpage.
Saves raw HTML and extracted text to .tmp/ directory.
"""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup


def scrape_webpage(url, timeout=30, output_dir=".tmp"):
    """
    Scrape a webpage and extract its content.

    Args:
        url: The URL to scrape
        timeout: Request timeout in seconds
        output_dir: Directory to save output files

    Returns:
        dict: Contains status, extracted data, and file paths
    """
    result = {
        "url": url,
        "timestamp": datetime.now().isoformat(),
        "status": "success",
        "error": None,
        "data": {},
        "files": {}
    }

    try:
        # Validate URL
        parsed = urlparse(url)
        if not parsed.scheme or not parsed.netloc:
            raise ValueError(f"Invalid URL: {url}")

        # Make request with common headers to avoid blocks
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
        }

        print(f"Fetching {url}...")
        response = requests.get(url, headers=headers, timeout=timeout)
        response.raise_for_status()

        # Parse HTML
        soup = BeautifulSoup(response.text, 'html.parser')

        # Extract metadata
        title = soup.find('title')
        result["data"]["title"] = title.get_text(strip=True) if title else "No title"

        # Extract meta description
        meta_desc = soup.find('meta', attrs={'name': 'description'})
        result["data"]["description"] = meta_desc.get('content', '') if meta_desc else ""

        # Remove script and style elements
        for element in soup(['script', 'style', 'nav', 'footer', 'header']):
            element.decompose()

        # Extract main text content
        text_content = soup.get_text(separator='\n', strip=True)
        # Clean up excessive whitespace
        lines = [line.strip() for line in text_content.split('\n') if line.strip()]
        result["data"]["text"] = '\n'.join(lines)
        result["data"]["text_length"] = len(result["data"]["text"])

        # Extract links
        links = []
        for link in soup.find_all('a', href=True):
            links.append({
                "text": link.get_text(strip=True),
                "href": link['href']
            })
        result["data"]["links_count"] = len(links)
        result["data"]["links"] = links[:50]  # Limit to first 50 links

        # Save outputs
        output_path = Path(output_dir)
        output_path.mkdir(exist_ok=True)

        # Generate safe filename from domain
        safe_name = parsed.netloc.replace('.', '_') + '_' + datetime.now().strftime('%Y%m%d_%H%M%S')

        # Save raw HTML
        html_file = output_path / f"{safe_name}.html"
        html_file.write_text(response.text, encoding='utf-8')
        result["files"]["html"] = str(html_file)

        # Save extracted text
        text_file = output_path / f"{safe_name}.txt"
        text_file.write_text(result["data"]["text"], encoding='utf-8')
        result["files"]["text"] = str(text_file)

        # Save metadata as JSON
        json_file = output_path / f"{safe_name}.json"
        json_file.write_text(json.dumps(result, indent=2), encoding='utf-8')
        result["files"]["json"] = str(json_file)

        print(f"✓ Successfully scraped {url}")
        print(f"  Title: {result['data']['title']}")
        print(f"  Text length: {result['data']['text_length']} characters")
        print(f"  Links found: {result['data']['links_count']}")
        print(f"  Saved to: {output_dir}/{safe_name}.*")

    except requests.exceptions.RequestException as e:
        result["status"] = "error"
        result["error"] = f"Request failed: {str(e)}"
        print(f"✗ Error fetching {url}: {e}", file=sys.stderr)

    except Exception as e:
        result["status"] = "error"
        result["error"] = f"Unexpected error: {str(e)}"
        print(f"✗ Unexpected error: {e}", file=sys.stderr)

    return result


def main():
    parser = argparse.ArgumentParser(
        description="Scrape a single webpage and extract its content",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python scrape_single_site.py https://example.com
  python scrape_single_site.py https://example.com --timeout 60
  python scrape_single_site.py https://example.com --output-dir data/
        """
    )

    parser.add_argument(
        'url',
        help='The URL to scrape'
    )

    parser.add_argument(
        '--timeout',
        type=int,
        default=30,
        help='Request timeout in seconds (default: 30)'
    )

    parser.add_argument(
        '--output-dir',
        default='.tmp',
        help='Directory to save output files (default: .tmp)'
    )

    parser.add_argument(
        '--json-only',
        action='store_true',
        help='Output only JSON result to stdout'
    )

    args = parser.parse_args()

    result = scrape_webpage(args.url, timeout=args.timeout, output_dir=args.output_dir)

    if args.json_only:
        print(json.dumps(result))

    # Exit with error code if scraping failed
    sys.exit(0 if result["status"] == "success" else 1)


if __name__ == "__main__":
    main()
