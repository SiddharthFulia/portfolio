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

  c: `#include <stdbool.h>
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
}`,

  cpp: `#include <array>
#include <string>

struct Node {
    std::array<Node*, 26> kids{};   // value-initialised to nullptr
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
}`,

  python: `class Node:
    __slots__ = ("kids", "terminal")
    def __init__(self):
        self.kids: dict[str, "Node"] = {}
        self.terminal = False

def insert(root: Node, word: str) -> None:
    cur = root
    for ch in word:
        if ch not in cur.kids:
            cur.kids[ch] = Node()
        cur = cur.kids[ch]
    cur.terminal = True

def search(root: Node, word: str) -> bool:
    cur = root
    for ch in word:
        if ch not in cur.kids:
            return False
        cur = cur.kids[ch]
    return cur.terminal`,

  java: `import java.util.HashMap;
import java.util.Map;

class Node { Map<Character, Node> kids = new HashMap<>(); boolean terminal; }

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
}`,

  rust: `use std::collections::HashMap;

pub struct Node {
    pub kids: HashMap<char, Box<Node>>,
    pub terminal: bool,
}

impl Node {
    pub fn new() -> Self { Self { kids: HashMap::new(), terminal: false } }

    pub fn insert(&mut self, word: &str) {
        let mut cur = self;
        for ch in word.chars() {
            cur = cur.kids.entry(ch).or_insert_with(|| Box::new(Node::new()));
        }
        cur.terminal = true;
    }

    pub fn search(&self, word: &str) -> bool {
        let mut cur = self;
        for ch in word.chars() {
            match cur.kids.get(&ch) {
                Some(n) => cur = n,
                None => return false,
            }
        }
        cur.terminal
    }
}`,
}
