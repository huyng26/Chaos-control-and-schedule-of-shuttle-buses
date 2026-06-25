# Chaos control and schedule of shuttle buses

Reimplementation of the nonlinear shuttle-bus model from:

> T. Nagatani, “Chaos control and schedule of shuttle buses,”  
> *Physica A* 371 (2006), 683–691.

The project includes:

- `Reimplementation.ipynb` — reproduction of the paper’s main figures;
- `shuttle_model.py` — event-driven numerical model;
- `test_shuttle_model.py` — numerical regression tests;
- `explaination.md` — derivation and interpretation of the model;
- `visualization/` — interactive browser simulation with animated buses.

## Run the notebook

Open `Reimplementation.ipynb` in Jupyter or VS Code and run all cells.

## Run the interactive simulation

```bash
./run_demo.sh
```

Then open <http://localhost:8000/>.

## Run tests

```bash
python -m unittest -v test_shuttle_model.py
```
