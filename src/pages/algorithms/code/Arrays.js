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

  c: `#include <stdlib.h>
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
}`,

  cpp: `#include <vector>

// std::vector already handles capacity doubling; this shows the mechanics
// for teaching. push_back / insert are the idiomatic real-world calls.
void insert_at(std::vector<int>& a, size_t index, int value) {
    if (a.size() + 1 > a.capacity())
        a.reserve(a.capacity() ? a.capacity() * 2 : 4);
    a.insert(a.begin() + index, value);    // shifts internally
}`,

  python: `from typing import List

def insert_at(arr: List[int], index: int, value: int) -> None:
    # Python lists grow automatically; list.insert shifts elements right.
    # This is O(n) — that's the array-insert cost, not a Python quirk.
    arr.insert(index, value)`,

  java: `import java.util.ArrayList;

public class DynamicArray {
    // ArrayList doubles its capacity (1.5x in OpenJDK) when full.
    public static void insertAt(ArrayList<Integer> a, int index, int value) {
        a.add(index, value);   // shifts every element from index rightward
    }
}`,

  rust: `pub struct Vec32 { data: Vec<i32> }

impl Vec32 {
    pub fn insert_at(&mut self, index: usize, value: i32) {
        // Vec handles growth; insert shifts the tail rightward.
        // Panics if index > len — mirrors the shift-right invariant.
        self.data.insert(index, value);
    }
}`,
}
