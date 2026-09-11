// Arrays — dynamic array with capacity doubling + insert-at-index.
// Line-count alignment (0-indexed) preserved with pseudocode so the
// existing activeLine mapping in Arrays.jsx keeps working.
export const ARRAYS_CODE = {
  pseudo: `function insert(arr, index, value):
    if length + 1 > capacity:
        arr = grow(arr, capacity * 2)
    for i from length down to index+1:
        arr[i] = arr[i - 1]     // shift right
    arr[index] = value
    length += 1`,

  c: `#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct { int *data; int len; int cap; } Vec;

void vec_insert(Vec *v, int index, int value) {
    if (v->len + 1 > v->cap) {            // grow when full
        v->cap = v->cap ? v->cap * 2 : 4;
        v->data = realloc(v->data, v->cap * sizeof(int));
    }
    for (int i = v->len; i > index; i--)  // shift right
        v->data[i] = v->data[i - 1];
    v->data[index] = value;
    v->len++;
}

int main(void) {
    Vec v = {0};
    int seed[] = {10, 20, 40, 50};
    for (int i = 0; i < 4; i++) vec_insert(&v, i, seed[i]);

    // Insert 30 at index 2  =>  {10, 20, 30, 40, 50}
    vec_insert(&v, 2, 30);

    printf("Array (len=%d, cap=%d):", v.len, v.cap);
    for (int i = 0; i < v.len; i++) printf(" %d", v.data[i]);
    printf("\\n");
    free(v.data);
    return 0;
}`,

  cpp: `#include <iostream>
#include <vector>

// std::vector already handles capacity doubling; this shows the mechanics
// for teaching. push_back / insert are the idiomatic real-world calls.
void insert_at(std::vector<int>& a, size_t index, int value) {
    if (a.size() + 1 > a.capacity())
        a.reserve(a.capacity() ? a.capacity() * 2 : 4);
    a.insert(a.begin() + index, value);    // shifts internally
}

int main() {
    std::vector<int> a = {10, 20, 40, 50};
    insert_at(a, 2, 30);   // => 10 20 30 40 50
    std::cout << "Array (len=" << a.size() << ", cap=" << a.capacity() << "):";
    for (int x : a) std::cout << " " << x;
    std::cout << "\\n";
    return 0;
}`,

  python: `from typing import List

def insert_at(arr: List[int], index: int, value: int) -> None:
    # Python lists grow automatically; list.insert shifts elements right.
    # This is O(n) — that's the array-insert cost, not a Python quirk.
    arr.insert(index, value)

if __name__ == "__main__":
    a = [10, 20, 40, 50]
    insert_at(a, 2, 30)   # => [10, 20, 30, 40, 50]
    print("Array:", a)`,

  java: `import java.util.ArrayList;

public class Main {
    // ArrayList doubles its capacity (1.5x in OpenJDK) when full.
    public static void insertAt(ArrayList<Integer> a, int index, int value) {
        a.add(index, value);   // shifts every element from index rightward
    }

    public static void main(String[] args) {
        ArrayList<Integer> a = new ArrayList<>();
        for (int v : new int[]{10, 20, 40, 50}) a.add(v);
        insertAt(a, 2, 30);
        System.out.println("Array: " + a);
    }
}`,

  rust: `pub struct Vec32 { data: Vec<i32> }

impl Vec32 {
    pub fn new() -> Self { Vec32 { data: Vec::new() } }
    pub fn insert_at(&mut self, index: usize, value: i32) {
        // Vec handles growth; insert shifts the tail rightward.
        // Panics if index > len — mirrors the shift-right invariant.
        self.data.insert(index, value);
    }
}

fn main() {
    let mut v = Vec32::new();
    for x in [10, 20, 40, 50] { v.data.push(x); }
    v.insert_at(2, 30);
    println!("Array: {:?}", v.data);
}`,
}

export const ARRAYS_SAMPLES = [
  { name: 'Middle insert', description: 'Insert 30 at index 2 into [10,20,40,50]', stdin: '', expected: '' },
  { name: 'Head insert',   description: 'Insert 5 at index 0', stdin: '', expected: '' },
  { name: 'Tail insert',   description: 'Insert 60 at end',   stdin: '', expected: '' },
]
