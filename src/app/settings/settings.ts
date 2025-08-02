import { CommonModule } from '@angular/common';
import { Component, inject, output, signal } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { BackEnd } from '../shared/services/back-end';

@Component({
  selector: 'settings',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    NzModalModule,
    NzButtonModule,
    NzInputModule,
  ],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings {
  public settingsForm!: FormGroup;
  public closed = output<void>(); // Output signal
  public fileName: string = '';
  private backService = inject(BackEnd);
  private workingPlacesSqliteFullPathName: string = '';
  // public sqliteFileName = signal<string>('');
  private lastSavedFolder: string = '';

  constructor(private fb: FormBuilder) {
    this.getSqliteFullPathNameProperty('orgFloorpProfilePlacesSqliteFile');
    this.getSqliteFullPathNameProperty(
      'workingCopyOfFloorpProfilePlacesSqliteFile'
    );
    this.getLastSavedFolderProperty();
    this.formInitialization();
  }

  formInitialization(): void {
    this.settingsForm = this.fb.group({
      orgFloorpsqliteFullPathName: ['', Validators.required],
      workingSqliteFullPathName: ['', Validators.required],
      outputFolder: ['', Validators.required],
    });
  }

  onGetOrgSqliteFile() {
    const fullPathName = this.settingsForm.get(
      'orgFloorpsqliteFullPathName'
    )?.value;
    console.log(
      'Original places.sqlite Full Path Name: ',
      this.settingsForm.get('orgFloorpsqliteFullPathName')?.value
    );
    this.getFullPathNameOfSqliteFile('orgFloorpProfilePlacesSqliteFile').catch(
      (err: any) => console.error('Unexpected error calling Electron:', err)
    );
  }

  onGetWorkingSqliteFile() {
    const fullPathName = this.settingsForm.get(
      'workingSqliteFullPathName'
    )?.value;
    console.log(
      'Working copy of the places.sqlite Full Path Name: ',
      this.settingsForm.get('workingSqliteFullPathName')?.value
    );
    this.getFullPathNameOfSqliteFile(
      'workingCopyOfFloorpProfilePlacesSqliteFile'
    ).catch((err: any) =>
      console.error('Unexpected error calling Electron:', err)
    );
  }

  async onCopyOrgSqliteFile() {
    try {
      const source = this.settingsForm.get('orgFloorpsqliteFullPathName')?.value;   //'/Users/me/source/file.md';
      const destination = this.settingsForm.get('workingSqliteFullPathName')?.value;   //'/Users/me/destination/file.md';
      if (!source || !destination) return;

      const result = await this.backService.copyFile(source, destination);
      console.log('Copy result:', result);
    } catch (error) {
      console.error('Error copying file:', error);
    }
  }

  onGetFolder() {
    const currentValue = this.settingsForm.get('outputFolder')?.value;
    if (
      currentValue &&
      currentValue.trim().length === 0 &&
      this.lastSavedFolder.trim().length === 0
    )
      this.getLastSavedFolderProperty();
    // const folderName = this.settingsForm.get('outputFolder')?.value;
    this.getFolderName(this.lastSavedFolder.trim());
  }

  get isFormFieldsEmpty(): boolean {
    const values = this.settingsForm.value;
    return Object.values(values).every(
      (val) => !val || (typeof val === 'string' && val.trim() === '')
    );
  }

  onSave() {
    if (this.settingsForm.valid) {
      console.log('Submitted values:', this.settingsForm.value);
    }
  }

  onClear() {
    this.settingsForm.reset();
  }

  onClose() {
    this.closed.emit(); // Tell parent (layout component) to close
  }

  async getSqliteFullPathNameProperty(filePathProperty: string) {
    try {
      const placeSsqlitePath = await this.backService.getPropertyValueByKey(
        // 'workingCopyOfFloorpProfilePlacesSqliteFile'
        filePathProperty
      );
      if (placeSsqlitePath)
        console.log(filePathProperty, ' Property value: ', placeSsqlitePath);

      if (filePathProperty === 'orgFloorpProfilePlacesSqliteFile')
        this.settingsForm
          .get('orgFloorpsqliteFullPathName')
          ?.setValue(placeSsqlitePath);

      if (filePathProperty === 'workingCopyOfFloorpProfilePlacesSqliteFile')
        this.settingsForm
          .get('workingSqliteFullPathName')
          ?.setValue(placeSsqlitePath);
    } catch (err) {
      console.error('Error retrieving property:', err);
    }
  }

  async getLastSavedFolderProperty() {
    try {
      const result = await this.backService.getPropertyValueByKey(
        'lastSavedFolder'
      );
      console.log('lastSavedFolder Property value: ', result);
      if (result) {
        this.lastSavedFolder = result;
        this.settingsForm.get('outputFolder')?.setValue(this.lastSavedFolder);
      }
    } catch (err) {
      console.error('Error retrieving lastSavedFolder property:', err);
    }
  }

  private async getFullPathNameOfSqliteFile(
    pathProperty: string
  ): Promise<void> {
    const dlgOptions = {
      title: 'Open .sqlite Files',
      filters: [{ name: 'SQLite Files', extensions: ['sqlite'] }],
    };
    try {
      const result = (await window.electronAPI.invoke(
        'open-file-dialog',
        // 'workingCopyOfFloorpProfilePlacesSqliteFile',
        pathProperty,
        dlgOptions
      )) as {
        success: boolean;
        message: string;
        filePath?: string;
        error?: string;
      };

      console.log('>===>> File selected: ', result.filePath);

      if (result.success && result.filePath) {
        // this.sqliteFileName.set(result.filePath!);
        if (pathProperty === 'orgFloorpProfilePlacesSqliteFile')
          this.settingsForm
            .get('orgFloorpsqliteFullPathName')
            ?.setValue(result.filePath!);
        if (pathProperty === 'workingCopyOfFloorpProfilePlacesSqliteFile')
          this.settingsForm
            .get('workingSqliteFullPathName')
            ?.setValue(result.filePath!);
      }
    } catch (err) {
      console.error('IPC open-file-dialog invoke failed:', err);
    }
  }

  private async getFolderName(initialFolder: string): Promise<void> {
    try {
      const result = (await window.electronAPI.invoke(
        'select-folder',
        initialFolder
      )) as {
        success: boolean;
        message: string;
        filePath?: string;
        error?: string;
      };

      console.log('>===>> Folder selected: ', result.filePath);

      if (result.success && result.filePath) {
        // this.sqliteFileName.set(result.filePath!);
        this.settingsForm.get('outputFolder')?.setValue(result.filePath!);
      }
    } catch (err) {
      console.error('IPC open-file-dialog invoke failed:', err);
    }
  }
}
