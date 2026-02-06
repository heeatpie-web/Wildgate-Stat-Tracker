import os
import shutil
import random
import yaml
from pathlib import Path

# Try to import ultralytics
try:
    from ultralytics import YOLO
except ImportError:
    print("Error: 'ultralytics' library not found.")
    print("Please run: pip install ultralytics")
    exit(1)

# Configuration
APP_NAME = "Wildgate Stat Tracker"
APPDATA = os.getenv('APPDATA')
SOURCE_DIR = os.path.join(APPDATA, APP_NAME, "training_data")
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) # n:/Coding (backup)/
DATASET_DIR = os.path.join(PROJECT_ROOT, "dataset")

CLASSES = [
    'LobbyRoster', 
    'KillFeed', 
    'Timer', 
    'ReachModifiers', 
    'SelfStats', 
    'ShipType', 
    'ShipName', 
    'IngameRoster',
    'ProspectorIcon'
]

def setup_dataset():
    print(f"Setting up dataset in {DATASET_DIR}...")
    
    # Clean previous
    if os.path.exists(DATASET_DIR):
        shutil.rmtree(DATASET_DIR)
    
    # Create structure
    for split in ['train', 'val']:
        os.makedirs(os.path.join(DATASET_DIR, 'images', split), exist_ok=True)
        os.makedirs(os.path.join(DATASET_DIR, 'labels', split), exist_ok=True)

    # Gather files
    src_images = os.path.join(SOURCE_DIR, "images")
    src_labels = os.path.join(SOURCE_DIR, "labels")
    
    if not os.path.exists(src_images) or not os.path.exists(src_labels):
        print(f"Error: Source directory {SOURCE_DIR} missing images or labels.")
        exit(1)

    files = [f for f in os.listdir(src_images) if f.endswith(('.png', '.jpg'))]
    print(f"Found {len(files)} potential training images.")
    
    # Shuffle and Split
    random.shuffle(files)
    split_idx = int(len(files) * 0.8) # 80% train
    train_files = files[:split_idx]
    val_files = files[split_idx:]
    
    if len(train_files) == 0:
        print("Error: Not enough data to train. Please label more images.")
        exit(1)

    # Copy files
    for f in train_files:
        copy_pair(f, src_images, src_labels, 'train')
        
    for f in val_files:
        copy_pair(f, src_images, src_labels, 'val')

    # Create YAML
    yaml_content = {
        'path': DATASET_DIR,
        'train': 'images/train',
        'val': 'images/val',
        'names': {i: name for i, name in enumerate(CLASSES)}
    }
    
    with open(os.path.join(DATASET_DIR, 'data.yaml'), 'w') as f:
        yaml.dump(yaml_content, f)
        
    print("Dataset setup complete.")
    return os.path.join(DATASET_DIR, 'data.yaml')

def copy_pair(filename, src_img_dir, src_lbl_dir, split):
    # Copy Image
    shutil.copy(os.path.join(src_img_dir, filename), 
                os.path.join(DATASET_DIR, 'images', split, filename))
    
    # Copy Label (if exists)
    txt_name = os.path.splitext(filename)[0] + '.txt'
    src_txt = os.path.join(src_lbl_dir, txt_name)
    if os.path.exists(src_txt):
        shutil.copy(src_txt, os.path.join(DATASET_DIR, 'labels', split, txt_name))

def train():
    yaml_path = setup_dataset()
    
    # Load model
    print("Loading YOLOv8n model...")
    model = YOLO('yolov8n.yaml').load('yolov8n.pt') # Build from scratch or load pretrained

    # Train
    print("Starting Training...")
    results = model.train(
        data=yaml_path, 
        epochs=50, 
        imgsz=640, 
        batch=4,
        project=os.path.join(PROJECT_ROOT, "ml_runs"),
        name="ocr_finetune"
    )
    
    # Export
    print("Exporting to ONNX...")
    success = model.export(format='onnx')
    
    # Move to root
    best_pt = os.path.join(PROJECT_ROOT, "ml_runs", "ocr_finetune", "weights", "best.onnx")
    target = os.path.join(PROJECT_ROOT, "yolov8n.onnx")
    
    if os.path.exists(best_pt):
        if os.path.exists(target):
            os.remove(target)
        shutil.copy(best_pt, target)
        print(f"SUCCESS: Model exported to {target}")
    else:
        # Fallback if export path differs (sometimes it exports to same dir as .pt)
        # Check standard export location
        print("Warning: Could not auto-move ONNX file. Please check ml_runs folder.")

if __name__ == "__main__":
    train()
