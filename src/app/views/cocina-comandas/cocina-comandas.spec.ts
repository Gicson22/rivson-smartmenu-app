import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CocinaComandas } from './cocina-comandas';

describe('CocinaComandas', () => {
  let component: CocinaComandas;
  let fixture: ComponentFixture<CocinaComandas>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CocinaComandas],
    }).compileComponents();

    fixture = TestBed.createComponent(CocinaComandas);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
