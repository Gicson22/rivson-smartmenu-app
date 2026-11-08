import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DueniaPanel } from './duenia-panel';

describe('DueniaPanel', () => {
  let component: DueniaPanel;
  let fixture: ComponentFixture<DueniaPanel>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DueniaPanel],
    }).compileComponents();

    fixture = TestBed.createComponent(DueniaPanel);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
