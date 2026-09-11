// Tries — insert + search on a character-indexed trie.
export const TRIES_CODE = {
  pseudo: `function insert(root, word):
    cur = root
    for ch in word:
        if not cur.children[ch]:
            cur.children[ch] = new Node
        cur = cur.children[ch]
    cur.terminal = true

function search(root, word):
    cur = root
    for ch in word:
        if not cur.children[ch]: return false
        cur = cur.children[ch]
    return cur.terminal`,

  c: `#include <stdio.h>
#include <stdbool.h>
#include <stdlib.h>
#define ALPHA 26

typedef struct Node { struct Node *kids[ALPHA]; bool terminal; } Node;

void trie_insert(Node *root, const char *w) {
    Node *cur = root;
    for (; *w; w++) {
        int i = *w - 'a';
        if (!cur->kids[i]) cur->kids[i] = calloc(1, sizeof(Node));
        cur = cur->kids[i];
    }
    cur->terminal = true;
}
bool trie_search(Node *root, const char *w) {
    Node *cur = root;
    for (; *w; w++) {
        int i = *w - 'a';
        if (!cur->kids[i]) return false;
        cur = cur->kids[i];
    }
    return cur->terminal;
}

int main(void) {
    Node *root = calloc(1, sizeof(Node));
    const char *words[] = {"cat", "car", "dog", "dove"};
    for (int i = 0; i < 4; i++) trie_insert(root, words[i]);
    const char *tests[] = {"cat", "car", "ca", "dove", "dov", "dogs"};
    for (int i = 0; i < 6; i++)
        printf("search(\\"%s\\") = %s\\n", tests[i], trie_search(root, tests[i]) ? "true" : "false");
    return 0;
}`,

  cpp: `#include <iostream>
#include <array>
#include <string>

struct Node {
    std::array<Node*, 26> kids{};
    bool terminal = false;
};

void insert(Node* root, const std::string& w) {
    Node* cur = root;
    for (char ch : w) {
        int i = ch - 'a';
        if (!cur->kids[i]) cur->kids[i] = new Node();
        cur = cur->kids[i];
    }
    cur->terminal = true;
}
bool search(Node* root, const std::string& w) {
    Node* cur = root;
    for (char ch : w) {
        int i = ch - 'a';
        if (!cur->kids[i]) return false;
        cur = cur->kids[i];
    }
    return cur->terminal;
}

int main() {
    Node* root = new Node();
    for (const std::string& w : {"cat", "car", "dog", "dove"}) insert(root, w);
    for (const std::string& t : {"cat", "car", "ca", "dove", "dov", "dogs"})
        std::cout << "search(\\"" << t << "\\") = " << (search(root, t) ? "true" : "false") << "\\n";
    return 0;
}`,

  python: `class Node:
    __slots__ = ("kids", "terminal")
    def __init__(self):
        self.kids = {}
        self.terminal = False

def insert(root, word):
    cur = root
    for ch in word:
        if ch not in cur.kids: cur.kids[ch] = Node()
        cur = cur.kids[ch]
    cur.terminal = True

def search(root, word):
    cur = root
    for ch in word:
        if ch not in cur.kids: return False
        cur = cur.kids[ch]
    return cur.terminal

if __name__ == "__main__":
    root = Node()
    for w in ["cat", "car", "dog", "dove"]: insert(root, w)
    for t in ["cat", "car", "ca", "dove", "dov", "dogs"]:
        print(f'search("{t}") = {search(root, t)}')`,

  java: `import java.util.HashMap;
import java.util.Map;

public class Main {
    static class Node { Map<Character, Node> kids = new HashMap<>(); boolean terminal; }

    public static void insert(Node root, String w) {
        Node cur = root;
        for (char ch : w.toCharArray()) {
            cur.kids.computeIfAbsent(ch, k -> new Node());
            cur = cur.kids.get(ch);
        }
        cur.terminal = true;
    }
    public static boolean search(Node root, String w) {
        Node cur = root;
        for (char ch : w.toCharArray()) {
            cur = cur.kids.get(ch);
            if (cur == null) return false;
        }
        return cur.terminal;
    }

    public static void main(String[] args) {
        Node root = new Node();
        for (String w : new String[]{"cat", "car", "dog", "dove"}) insert(root, w);
        for (String t : new String[]{"cat", "car", "ca", "dove", "dov", "dogs"})
            System.out.println("search(\\"" + t + "\\") = " + search(root, t));
    }
}`,

  rust: `use std::collections::HashMap;

struct Node {
    kids: HashMap<char, Box<Node>>,
    terminal: bool,
}

impl Node {
    fn new() -> Self { Self { kids: HashMap::new(), terminal: false } }

    fn insert(&mut self, word: &str) {
        let mut cur = self;
        for ch in word.chars() {
            cur = cur.kids.entry(ch).or_insert_with(|| Box::new(Node::new()));
        }
        cur.terminal = true;
    }

    fn search(&self, word: &str) -> bool {
        let mut cur = self;
        for ch in word.chars() {
            match cur.kids.get(&ch) {
                Some(n) => cur = n,
                None => return false,
            }
        }
        cur.terminal
    }
}

fn main() {
    let mut root = Node::new();
    for w in ["cat", "car", "dog", "dove"] { root.insert(w); }
    for t in ["cat", "car", "ca", "dove", "dov", "dogs"] {
        println!("search(\"{}\") = {}", t, root.search(t));
    }
}`,
}

export const TRIES_SAMPLES = [
  { name: 'Cat/Car/Dog', description: 'Insert 4 words, run 6 search cases',   stdin: '', expected: '' },
  { name: 'Prefix',      description: 'Test prefix (present but not terminal)', stdin: '', expected: '' },
]
