/// Solve `a x = b` for a square `a`, by Gaussian elimination with partial
/// pivoting. `None` when `a` is singular. The systems here are a few dozen
/// unknowns at most, so this is exact enough and needs no library.
pub fn solve(a: &[Vec<f64>], b: &[f64]) -> Option<Vec<f64>> {
    let size = b.len();
    let augmented: Vec<Vec<f64>> = a
        .iter()
        .zip(b)
        .map(|(row, &value)| row.iter().copied().chain(std::iter::once(value)).collect())
        .collect();
    let reduced = (0..size).try_fold(augmented, |rows, column| eliminate(&rows, column))?;
    back_substitute(&reduced, size)
}

const SINGULAR: f64 = 1e-12;

fn entry(rows: &[Vec<f64>], row: usize, column: usize) -> f64 {
    rows.get(row)
        .and_then(|values| values.get(column))
        .copied()
        .unwrap_or(0.0)
}

/// Bring the largest remaining pivot of `column` up, and clear the column below it.
fn eliminate(rows: &[Vec<f64>], column: usize) -> Option<Vec<Vec<f64>>> {
    let pivot_row = (column..rows.len()).max_by(|&left, &right| {
        entry(rows, left, column)
            .abs()
            .total_cmp(&entry(rows, right, column).abs())
    })?;
    let pivot = entry(rows, pivot_row, column);
    if pivot.abs() < SINGULAR {
        return None;
    }
    let swapped: Vec<Vec<f64>> = rows
        .iter()
        .enumerate()
        .map(|(index, row)| {
            if index == column {
                rows.get(pivot_row).cloned().unwrap_or_default()
            } else if index == pivot_row {
                rows.get(column).cloned().unwrap_or_default()
            } else {
                row.clone()
            }
        })
        .collect();
    let pivot_values = swapped.get(column)?.clone();
    Some(
        swapped
            .into_iter()
            .enumerate()
            .map(|(index, row)| {
                if index <= column {
                    row
                } else {
                    let factor = row.get(column).copied().unwrap_or(0.0) / pivot;
                    row.iter()
                        .zip(&pivot_values)
                        .map(|(value, above)| value - factor * above)
                        .collect()
                }
            })
            .collect(),
    )
}

fn back_substitute(rows: &[Vec<f64>], size: usize) -> Option<Vec<f64>> {
    (0..size).rev().try_fold(vec![0.0; size], |solved, row| {
        let known: f64 = (row + 1..size)
            .map(|column| entry(rows, row, column) * solved.get(column).copied().unwrap_or(0.0))
            .sum();
        let value = (entry(rows, row, size) - known) / entry(rows, row, row);
        value.is_finite().then(|| {
            solved
                .iter()
                .enumerate()
                .map(|(index, &old)| if index == row { value } else { old })
                .collect()
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn solves_a_small_system() {
        let solution = solve(&[vec![2.0, 1.0], vec![1.0, 3.0]], &[5.0, 10.0]);
        let expected = [1.0, 3.0];
        assert!(solution.is_some_and(|found| {
            found
                .iter()
                .zip(expected)
                .all(|(left, right)| (left - right).abs() < 1e-12)
        }));
    }

    #[test]
    fn needs_a_pivot_swap() {
        let solution = solve(&[vec![0.0, 1.0], vec![1.0, 0.0]], &[2.0, 3.0]);
        let expected = [3.0, 2.0];
        assert!(solution.is_some_and(|found| {
            found
                .iter()
                .zip(expected)
                .all(|(left, right)| (left - right).abs() < 1e-12)
        }));
    }

    #[test]
    fn refuses_a_singular_system() {
        assert!(solve(&[vec![1.0, 2.0], vec![2.0, 4.0]], &[1.0, 2.0]).is_none());
    }
}
