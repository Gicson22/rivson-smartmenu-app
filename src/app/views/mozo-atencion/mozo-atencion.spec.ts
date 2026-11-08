import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MozoAtencion } from './mozo-atencion';

describe('MozoAtencion', () => {
  let component: MozoAtencion;
  let fixture: ComponentFixture<MozoAtencion>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MozoAtencion],
    }).compileComponents();

    fixture = TestBed.createComponent(MozoAtencion);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
