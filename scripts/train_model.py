import os
import shutil
from ultralytics import YOLO

# Configuration
# ----------------
# Provide the absolute path to your 'userData/training_data' folder here
# You can find this by checking the logs in Dev OCR Lab when you save a dataset.
# Example: C:/Users/YourName/AppData/Roaming/Wildgate Stat Tracker/training_data
DATASET_DIR = r"C:\\Users\\<USERNAME>\AppData\Roaming\Wildgate Stat Tracker\training_data"

# Classes matching your DevOCRPanel.tsx
CLASSES = {
    0: 'LobbyRoster',
    1: 'KillFeed',
    2: 'Timer',
    3: 'ReachModifiers',
    4: 'SelfStats',
    5: 'ShipType',
    6: 'ShipName',
    7: 'IngameRoster',
    8: 'ProspectorIcon'
}

def setup_dataset():
    """
    Organizes the flat structure from the app into YOLO's required train/val structure.
    """
    if not os.path.exists(DATASET_DIR):
        print(f"Error: Dataset directory not found at {DATASET_DIR}")
        return False
        
    print(f"Setting up dataset from: {DATASET_DIR}")
    
    # Create YOLO structure
    yolo_root = os.path.join(os.getcwd(), 'yolo_dataset')
    if os.path.exists(yolo_root):
        shutil.rmtree(yolo_root)
    
    os.makedirs(os.path.join(yolo_root, 'train', 'images'), exist_ok=True)
    os.makedirs(os.path.join(yolo_root, 'train', 'labels'), exist_ok=True)
    os.makedirs(os.path.join(yolo_root, 'val', 'images'), exist_ok=True)
    os.makedirs(os.path.join(yolo_root, 'val', 'labels'), exist_ok=True)

    # Move/Copy files
    src_images = os.path.join(DATASET_DIR, 'images')
    src_labels = os.path.join(DATASET_DIR, 'labels')
    
    files = [f for f in os.listdir(src_images) if f.endswith(('.png', '.jpg'))]
    
    # Split 80/20
    split_idx = int(len(files) * 0.8)
    train_files = files[:split_idx]
    val_files = files[split_idx:]
    
    for f in train_files:
        shutil.copy(os.path.join(src_images, f), os.path.join(yolo_root, 'train', 'images', f))
        txt_name = os.path.splitext(f)[0] + '.txt'
        if os.path.exists(os.path.join(src_labels, txt_name)):
            shutil.copy(os.path.join(src_labels, txt_name), os.path.join(yolo_root, 'train', 'labels', txt_name))
            
    for f in val_files:
        shutil.copy(os.path.join(src_images, f), os.path.join(yolo_root, 'val', 'images', f))
        txt_name = os.path.splitext(f)[0] + '.txt'
        if os.path.exists(os.path.join(src_labels, txt_name)):
            shutil.copy(os.path.join(src_labels, txt_name), os.path.join(yolo_root, 'val', 'labels', txt_name))

    # Create data.yaml
    yaml_content = f"""
path: {yolo_root}
train: train/images
val: val/images

nc: {len(CLASSES)}
names: {list(CLASSES.values())}
    """
    
    with open(os.path.join(yolo_root, 'data.yaml'), 'w') as f:
        f.write(yaml_content)
        
    return str(os.path.join(yolo_root, 'data.yaml'))

def train():
    yaml_path = setup_dataset()
    if not yaml_path:
        return

    print("Starting Training...")
    # Load a model
    model = YOLO("yolov8n.pt")  # load a pretrained model (recommended for training)

    # Train the model
    # epochs=50 is usually enough for a small UI dataset.
    # imgsz=640 matches our app inference.
    results = model.train(data=yaml_path, epochs=50, imgsz=640)

    print("Training Complete. Exporting to ONNX...")
    path = model.export(format="onnx", opset=12)  # ONNX export
    print(f"Model saved to: {path}")
    print("RENAME this file to 'yolov8n.onnx' and place it in your app root to use it!")

if __name__ == '__main__':
    train()

